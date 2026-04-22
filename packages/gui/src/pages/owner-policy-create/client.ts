/**
 * Client-side logic for the create policy page.
 */
import "./style.css";
import { olToast, olApiError } from "../../shared/common";

interface OwnerPolicyCreatePageData {
    ownerType: "user" | "org";
    ownerId: string;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerPolicyCreatePageData;
    }
}

const { ownerType, ownerId } = window.__PAGE_DATA__;

async function createPolicy() {
    const name = (document.getElementById("policy-name") as HTMLInputElement).value.trim() || null;
    const desc = (document.getElementById("policy-desc") as HTMLInputElement).value.trim() || null;
    const agentId = (document.getElementById("agent-id") as HTMLInputElement).value.trim() || null;
    const yaml = (document.getElementById("policy-yaml") as HTMLTextAreaElement).value;

    // Route to the org-specific endpoint when in an org scope so the policy
    // belongs to the org and not the session user.
    const url = ownerType === "org"
        ? `/v1/owner/organizations/${encodeURIComponent(ownerId)}/policies`
        : "/v1/owner/policies";

    const res = await fetch(url, {
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
