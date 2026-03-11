/**
 * Client-side logic for the create policy page.
 */

declare global {
    interface Window {
        createPolicy: () => Promise<void>;
    }
}

window.createPolicy = async function () {
    const token = sessionStorage.getItem("openleash_session");
    const name = (document.getElementById("policyName") as HTMLInputElement).value.trim() || null;
    const desc = (document.getElementById("policyDesc") as HTMLInputElement).value.trim() || null;
    const agentId = (document.getElementById("agentId") as HTMLInputElement).value.trim() || null;
    const yaml = (document.getElementById("policyYaml") as HTMLTextAreaElement).value;

    const res = await fetch("/v1/owner/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ policy_yaml: yaml, applies_to_agent_principal_id: agentId, name, description: desc }),
    });

    if (res.ok) {
        window.location.href = "/gui/owner/policies";
    } else {
        const data = await res.json();
        window.olToast(window.olApiError(data, "Failed to create policy"), "error");
    }
};
