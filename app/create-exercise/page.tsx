import { redirect } from "next/navigation";

/** The maintained exercise editor lives in the training catalog. */
export default function CreateExercisePage() {
  redirect("/training?tab=Exercises&create=1");
}
