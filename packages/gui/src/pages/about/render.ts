import { renderPage, escapeHtml } from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface PackageInfo {
    name: string;
    version: string;
}

export interface AboutData {
    version: string;
    commitHash: string | null;
    nodeVersion: string;
    packages: PackageInfo[];
}

export function renderAbout(data: AboutData): string {
    const packageRows = data.packages
        .map(
            (p) => `
      <tr>
        <td><span class="mono">${escapeHtml(p.name)}</span></td>
        <td class="mono">${escapeHtml(p.version)}</td>
      </tr>`,
        )
        .join("");

    const content = `
    <div class="page-header">
      <h2>About</h2>
      <p>Server version and installed packages</p>
    </div>

    <div class="card">
      <div class="card-title">Server</div>
      <table><colgroup><col style="width:200px"><col></colgroup><tbody>
        <tr>
          <td class="about-label">Version</td>
          <td class="mono">${escapeHtml(data.version)}${data.commitHash ? ` <span class="text-muted">(${escapeHtml(data.commitHash)})</span>` : ""}</td>
        </tr>
        <tr>
          <td class="about-label">Node.js</td>
          <td class="mono">${escapeHtml(data.nodeVersion)}</td>
        </tr>
      </tbody></table>
    </div>

    <div class="card">
      <div class="card-title">Installed Packages</div>
      ${
          packageRows
              ? `<table><colgroup><col style="width:320px"><col></colgroup><tbody>${packageRows}</tbody></table>`
              : '<p class="text-muted" style="padding:12px 16px;font-size:13px">No @openleash packages detected.</p>'
      }
    </div>

    ${assetTags("pages/about/client.ts")}
  `;

    return renderPage("About", content, "/gui/admin/about");
}
