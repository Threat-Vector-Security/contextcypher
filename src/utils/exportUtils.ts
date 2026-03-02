const buildTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadTextFile = (content: string, filenameBase: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const timestamp = buildTimestamp();
  triggerDownload(blob, `${filenameBase}-${timestamp}.txt`);
};

export const downloadHtmlFile = (content: string, filenameBase: string) => {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const timestamp = buildTimestamp();
  triggerDownload(blob, `${filenameBase}-${timestamp}.html`);
};
