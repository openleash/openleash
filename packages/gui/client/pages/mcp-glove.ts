/**
 * Client-side logic for the MCP Glove config page.
 */

declare global {
    interface Window {
        updateGloveConfig: () => void;
        copyGloveConfig: () => void;
    }
}

window.updateGloveConfig = function () {
    const profile = (document.getElementById("glove-profile") as HTMLSelectElement).value;
    const agent = (document.getElementById("glove-agent") as HTMLSelectElement).value;
    const upstream = (document.getElementById("glove-upstream") as HTMLInputElement).value;
    const url = (document.getElementById("glove-url") as HTMLInputElement).value;
    const timeout = (document.getElementById("glove-timeout") as HTMLInputElement).value;

    const upstreamParts = upstream.trim().split(/\s+/);
    const command = upstreamParts[0] || "npx";
    const args = upstreamParts.slice(1);

    const config = {
        "openleash-glove": {
            command: "npx",
            args: [
                "-y", "@openleash/mcp-glove",
                "--profile", profile,
                "--agent-id", agent || "YOUR_AGENT_ID",
                "--openleash-url", url,
                "--approval-timeout", timeout || "120000",
                "--private-key", "<PASTE_PRIVATE_KEY>",
                "--upstream-command", command,
            ].concat(args.length > 0 ? ["--upstream-args", ...args] : []),
        },
    };

    document.getElementById("glove-output")!.textContent = JSON.stringify(config, null, 2);
};

window.copyGloveConfig = function () {
    const text = document.getElementById("glove-output")!.textContent!;
    navigator.clipboard.writeText(text);
    const btn = (event as Event).target as HTMLButtonElement;
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1200);
};

// Initialize on load
window.updateGloveConfig();
