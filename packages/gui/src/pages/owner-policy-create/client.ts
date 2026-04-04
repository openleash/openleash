/**
 * Client-side logic for the create policy page.
 */
import "./style.css";
import { olToast, olApiError } from "../../shared/common";

async function createPolicy() {
    const name = (document.getElementById("policy-name") as HTMLInputElement).value.trim() || null;
    const desc = (document.getElementById("policy-desc") as HTMLInputElement).value.trim() || null;
    const agentId = (document.getElementById("agent-id") as HTMLInputElement).value.trim() || null;
    const yaml = (document.getElementById("policy-yaml") as HTMLTextAreaElement).value;

    const res = await fetch("/v1/owner/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_yaml: yaml, applies_to_agent_principal_id: agentId, name, description: desc }),
    });

    if (res.ok) {
        window.location.href = "/gui/policies";
    } else {
        const data = await res.json();
        olToast(olApiError(data, "Failed to create policy"), "error");
    }
}

document.getElementById("btn-create-policy")?.addEventListener("click", createPolicy);
