/**
 * Rechtliche Pflichtangaben — bitte vor Launch ausfüllen.
 * Diese Werte erscheinen in Impressum und Datenschutz.
 */
export const legalConfig = {
  /** z. B. "Max Mustermann" oder Firmenname */
  operatorName: "Joshua Sperber",
  /** Straße, PLZ Ort */
  operatorAddress: "Pufendorfstraße 6a, 10247 Berlin, Germany",
  /** Kontakt-E-Mail */
  operatorEmail: "Joshua.sperber@web.de",
  /** Optional: Telefon */
  operatorPhone: "+49 115259655035" as string | undefined,
  /** Optional: USt-IdNr. / Register */
  operatorRegister: "" as string | undefined,
  /** Verantwortlich für Inhalte (§ 18 MStV), falls abweichend */
  contentResponsible: "Joshua Sperber" as string | undefined,
};

export function isLegalConfigComplete() {
  return (
    !legalConfig.operatorName.includes("[") &&
    !legalConfig.operatorAddress.includes("[") &&
    !legalConfig.operatorEmail.includes("[")
  );
}
