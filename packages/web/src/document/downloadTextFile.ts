/**
 * Hands the reader a file without a server in the loop.
 *
 * The whole point of the site is that a schema pasted into it does not leave the
 * browser. A blob URL keeps that promise literally: the bytes never become a
 * request, so there is no endpoint that could log them and no deployment
 * decision that could change that later.
 */
export const downloadTextFile = (filename: string, text: string): void => {
  // `text/plain` rather than an invented `application/dbml`: no media type is
  // registered for DBML, and browsers offer to display an unknown type instead
  // of saving it.
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // In the document rather than detached: Firefox ignores a click on an anchor
  // that was never attached.
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Not revoked on the line after the click. The download reads the blob
  // asynchronously, and revoking synchronously has raced it — an empty file is
  // the failure mode. A blob released one task later is not a leak.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};
