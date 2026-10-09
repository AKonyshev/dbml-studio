// The connection string grammar SQL Server tools share: key=value pairs split
// on `;`, a value may be wrapped in {…} (with `}}` for a literal `}`) or in
// quotes (with the quote doubled), keys are case-insensitive. This is the form
// `mssql` and the @dbml/connector read, so it is the form this package keeps a
// SQL Server connection in, whatever the user typed.

// Reads leniently: a brace or quote that is never closed takes the rest of the
// string, and a pair with no `=` ends the scan. The driver is the judge of what
// the keys mean; this only gets the values out intact.
export function parseAdo(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i < text.length) {
    const eq = text.indexOf("=", i);
    if (eq === -1) break;
    const key = text.slice(i, eq).trim().toLowerCase();
    let j = eq + 1;
    while (text[j] === " ") j++;

    let value = "";
    const open = text[j];
    const close =
      open === "{" ? "}" : open === '"' || open === "'" ? open : undefined;

    if (close !== undefined) {
      j++;
      while (j < text.length) {
        if (text[j] === close) {
          if (text[j + 1] === close) {
            value += close;
            j += 2;
            continue;
          }
          j++;
          break;
        }
        value += text[j++];
      }
      const semicolon = text.indexOf(";", j);
      i = semicolon === -1 ? text.length : semicolon + 1;
    } else {
      const semicolon = text.indexOf(";", j);
      value = text.slice(j, semicolon === -1 ? text.length : semicolon).trim();
      i = semicolon === -1 ? text.length : semicolon + 1;
    }

    if (key !== "") map.set(key, value);
  }
  return map;
}

const NEEDS_QUOTING = /[;={}]|^\s|\s$/;

export function formatAdo(map: Map<string, string>): string {
  return [...map]
    .map(([key, value]) => {
      const written = NEEDS_QUOTING.test(value)
        ? `{${value.replace(/}/g, "}}")}}`
        : value;
      return `${key}=${written}`;
    })
    .join(";");
}
