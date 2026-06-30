/** PostgREST-Filter korrekt setzen (E-Mails mit @ brechen filter.split("=") nicht). */

export function applyEqFilter(url: URL, column: string, value: string) {
  url.searchParams.set(column, `eq.${value}`);
}
