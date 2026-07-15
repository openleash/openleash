/**
 * Client-side logic for the edit policy page.
 */
import "./style.css";
import { olToast, olApiError } from "../../shared/common";
import { mountPolicyBuilder } from "../../shared/policy-builder";

interface OwnerPolicyEditPageData {
    policyId: string;
    orgId: string | null;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerPolicyEditPageData;
    }
}

const { policyId, orgId } = window.__PAGE_DATA__;

const builder = mountPolicyBuilder();

const policyUrl = orgId
    ? `/v1/owner/organizations/${encodeURIComponent(orgId)}/policies/${encodeURIComponent(policyId)}`
    : `/v1/owner/policies/${encodeURIComponent(policyId)}`;

async function savePolicy() {
    const name = (document.getElementById("policy-name") as HTMLInputElement).value.trim() || null;
    const desc = (document.getElementById("policy-desc") as HTMLInputElement).value.trim() || null;
    const problems = builder.validate();
    if (problems.length > 0) {
        olToast(problems[0] + (problems.length > 1 ? ` (+${problems.length - 1} more)` : ""), "error");
        return;
    }
    const yaml = builder.getYaml();

    const res = await fetch(policyUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_yaml: yaml, name, description: desc }),
    });

    if (res.ok) {
        window.location.href = "/gui/policies";
    } else {
        const data = await res.json().catch(() => ({}));
        olToast(olApiError(data, "Failed to save policy"), "error");
    }
}

document.getElementById("btn-save-policy")?.addEventListener("click", savePolicy);
