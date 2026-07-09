import { NextRequest, NextResponse } from "next/server";
import { userHasAiConsent } from "@/lib/server/ai-consent";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";
import { buildMemberViewFromProgress } from "@/lib/server/team-progress";
import { applyShareLevelToMemberView } from "@/lib/server/team-member-view";
import { fetchProgressByUserIds } from "@/lib/server/user-progress-team";
import { buildTeamCoachHeuristic } from "@/lib/team-coach-heuristic";
import { normalizeOpponentStyles } from "@/lib/opponent-styles";
import type { TeamCoachResponse, TeamMemberView, TeamRole } from "@/lib/team-types";

type MemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  member_email?: string | null;
  role: TeamRole;
  display_name: string | null;
  position: string | null;
  play_style: string | null;
  share_level: "summary" | "full";
};

type ScoutingRow = { opponent_name: string; styles: string[] };

const openaiKey = process.env.OPENAI_API_KEY;
const groqKey = process.env.GROQ_API_KEY;

async function callTeamLlm(prompt: string): Promise<string | null> {
  const baseUrl = groqKey
    ? (process.env.GROQ_BASE_URL?.replace(/\/$/, "") || "https://api.groq.com/openai/v1")
    : process.env.OPENAI_BASE_URL?.replace(/\/$/, "");
  const apiKey = groqKey ?? openaiKey;
  const model = groqKey
    ? process.env.GROQ_MODEL ?? "llama-3.1-8b-instant"
    : process.env.OPENAI_COACH_MODEL ?? "gpt-4o-mini";
  if (!baseUrl || !apiKey) return null;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 420,
      messages: [
        {
          role: "system",
          content:
            "Du bist Basketball-Team-Coach. Antworte NUR mit JSON: {\"headline\": string, \"bullets\": string[], \"starters\": string[], \"matchupHints\": string[]}. Du-Form, konkret, max 6 bullets.",
        },
        { role: "user", content: prompt },
      ],
    }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? null;
}

function parseCoachJson(raw: string): TeamCoachResponse | null {
  try {
    const parsed = JSON.parse(raw) as TeamCoachResponse;
    if (!parsed.headline || !Array.isArray(parsed.bullets)) return null;
    return {
      headline: String(parsed.headline),
      bullets: parsed.bullets.map(String).slice(0, 6),
      starters: Array.isArray(parsed.starters) ? parsed.starters.map(String).slice(0, 5) : [],
      matchupHints: Array.isArray(parsed.matchupHints) ? parsed.matchupHints.map(String).slice(0, 6) : [],
      source: "llm",
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    teamId?: string;
    opponentName?: string;
    opponentStyles?: string[];
  } | null;
  const teamId = body?.teamId?.trim();
  if (!teamId) return NextResponse.json({ error: "invalid_team" }, { status: 400 });

  const membership = await supabaseRest<MemberRow[]>(
    `team_members?team_id=eq.${teamId}&user_id=eq.${user.id}&select=*&limit=1`,
  );
  if (!membership.ok || !membership.data?.[0]) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const membersRes = await supabaseRest<MemberRow[]>(`team_members?team_id=eq.${teamId}&select=*`);
  const memberRows = membersRes.data ?? [];
  const userIds = memberRows.map((row) => row.user_id);
  const emailByUserId = Object.fromEntries(
    memberRows.map((row) => [row.user_id, row.member_email ?? null]),
  );
  const progressByUser = await fetchProgressByUserIds(userIds, emailByUserId);

  const members: TeamMemberView[] = memberRows.map((row) => {
    const view = buildMemberViewFromProgress(row, progressByUser.get(row.user_id) ?? null);
    return applyShareLevelToMemberView(view, row.user_id, row.share_level, user.id);
  });

  let opponentStyles = normalizeOpponentStyles(body?.opponentStyles ?? []);
  const opponentName = body?.opponentName?.trim();
  if (opponentName) {
    const scoutingRes = await supabaseRest<ScoutingRow[]>(
      `opponent_scouting?team_id=eq.${teamId}&opponent_name=eq.${encodeURIComponent(opponentName)}&select=opponent_name,styles&limit=1`,
    );
    const scoutingStyles = normalizeOpponentStyles(scoutingRes.data?.[0]?.styles ?? []);
    if (scoutingStyles.length > 0) opponentStyles = scoutingStyles;
  }

  const heuristic = buildTeamCoachHeuristic({ members, opponentName, opponentStyles });

  const consented = await userHasAiConsent(user);
  if (!consented) {
    return NextResponse.json({
      ...heuristic,
      warning: "KI-Team-Coach erfordert Einwilligung im Profil.",
    });
  }

  const rosterJson = JSON.stringify(
    members.map((member) => ({
      name: member.displayName,
      position: member.position,
      form: member.form.score,
      tone: member.form.tone,
      reasons: member.form.reasons.slice(0, 2),
    })),
  ).slice(0, 1800);

  const prompt = `Team-Kader (Form-Score 0-100):
${rosterJson}

Gegner: ${opponentName ?? "unbekannt"}
Gegner-Stil: ${opponentStyles.join(", ") || "keine Tags"}

Regelbasierte Start-Idee: ${heuristic.starters.join(", ")}
Matchup-Hinweise: ${heuristic.matchupHints.join(" | ")}

Erstelle Team-Empfehlung: wer starten sollte, wer in Form ist, Matchup-Hinweise gegen diesen Gegner.`;

  const llmRaw = await callTeamLlm(prompt);
  if (llmRaw) {
    const parsed = parseCoachJson(llmRaw);
    if (parsed) return NextResponse.json(parsed);
  }

  return NextResponse.json(heuristic);
}
