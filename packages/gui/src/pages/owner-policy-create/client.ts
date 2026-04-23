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

// ─── Scope selector (org only) ──────────────────────────────────────
const groupPicker = document.getElementById("group-picker");
const agentPicker = document.getElementById("agent-picker");
document.querySelectorAll<HTMLInputElement>("input[name='applies-to']").forEach((input) => {
    input.addEventListener("change", () => {
        if (!input.checked) return;
        groupPicker?.classList.toggle("hidden", input.value !== "group");
        agentPicker?.classList.toggle("hidden", input.value !== "agent");
    });
});

async function createPolicy() {
    const name = (document.getElementById("policy-name") as HTMLInputElement).value.trim() || null;
    const desc = (document.getElementById("policy-desc") as HTMLInputElement).value.trim() || null;
    const yaml = (document.getElementById("policy-yaml") as HTMLTextAreaElement).value;

    // Determine scope: explicit in org mode, agent-or-all in personal mode.
    let appliesToAgent: string | null = null;
    let appliesToGroup: string | null = null;
    if (ownerType === "org") {
        const chosen = (document.querySelector<HTMLInputElement>("input[name='applies-to']:checked"))?.value;
        if (chosen === "group") {
            appliesToGroup = (document.getElementById("group-id") as HTMLSelectElement | null)?.value ?? null;
            if (!appliesToGroup) {
                olToast("Pick a group", "error");
                return;
            }
        } else if (chosen === "agent") {
            appliesToAgent = (document.getElementById("agent-id") as HTMLInputElement | null)?.value.trim() || null;
            if (!appliesToAgent) {
                olToast("Enter an agent principal ID", "error");
                return;
            }
        }
    } else {
        // Personal scope keeps today's behavior — optional agent input.
        appliesToAgent = (document.getElementById("agent-id") as HTMLInputElement | null)?.value.trim() || null;
    }

    const url = ownerType === "org"
        ? `/v1/owner/organizations/${encodeURIComponent(ownerId)}/policies`
        : "/v1/owner/policies";

    const payload: Record<string, unknown> = {
        policy_yaml: yaml,
        name,
        description: desc,
    };
    if (appliesToAgent) payload.applies_to_agent_principal_id = appliesToAgent;
    if (appliesToGroup) payload.applies_to_group_id = appliesToGroup;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (res.ok) {
        window.location.href = "/gui/policies";
    } else {
        const data = await res.json();
        olToast(olApiError(data, "Failed to create policy"), "error");
    }
}

document.getElementById("btn-create-policy")?.addEventListener("click", createPolicy);
