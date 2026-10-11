// Build a real PDF file from the on-page report. The browser draws the text (so Devanagari
// is shaped correctly) and each A4 page is placed into the PDF as an image.
export async function downloadPdf(container: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  await document.fonts.ready;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  let first = true;
  for (const el of container.querySelectorAll<HTMLElement>(".pdf-page")) {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.92);
    // A section taller than one sheet continues on the next sheet.
    for (let offset = 0; offset < imgH - 1; offset += pageH) {
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(img, "JPEG", 0, -offset, pageW, imgH);
    }
  }
  pdf.save(filename);
}
