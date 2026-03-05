const PRINT_DELAY_MS = 300;

interface ExportPlannerOptions {
  pageSet?: string;
  title?: string;
}

export function exportPlanner(options: ExportPlannerOptions = {}): void {
  const { pageSet = "preview", title = "GoodNotes Planner" } = options;
  const pages = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-planner-page][data-planner-set="${pageSet}"]`),
  );

  if (!pages.length) {
    console.warn(`No planner pages found for export set "${pageSet}".`);
    return;
  }

  const inlineStyles = Array.from(document.querySelectorAll<HTMLStyleElement>("style"))
    .map((styleTag) => styleTag.outerHTML)
    .join("\n");

  const stylesheetLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map((linkTag) => `<link rel="stylesheet" href="${new URL(linkTag.href, window.location.href).href}" />`)
    .join("\n");

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Export was blocked. Allow pop-ups for this site, then try again.");
    return;
  }

  const pagesMarkup = pages.map((page) => page.outerHTML).join("\n");

  printWindow.document.open();
  printWindow.document.write(`
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${stylesheetLinks}
    ${inlineStyles}
  </head>
  <body class="print-body">${pagesMarkup}</body>
</html>
`);
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  const handleAfterPrint = () => {
    printWindow.removeEventListener("afterprint", handleAfterPrint);
    printWindow.close();
  };

  printWindow.addEventListener("afterprint", handleAfterPrint);

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(triggerPrint, PRINT_DELAY_MS);
    return;
  }

  printWindow.addEventListener(
    "load",
    () => {
      window.setTimeout(triggerPrint, PRINT_DELAY_MS);
    },
    { once: true },
  );
}
