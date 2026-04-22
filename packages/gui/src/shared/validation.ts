import { z } from "zod";

// ─── Reusable primitives ─────────────────────────────────────────────

export const uuid = z.string().uuid("Must be a valid UUID");

export const passphrase = z
    .string()
    .min(8, "Passphrase must be at least 8 characters");

export const displayName = z
    .string()
    .trim()
    .min(1, "Display name is required");

export const totpCode = z
    .string()
    .regex(/^\d{6}$/, "Code must be exactly 6 digits");

// ─── Initial Setup ───────────────────────────────────────────────────

/** Client-side form validation (includes passphrase confirmation) */
export const InitialSetupFormSchema = z
    .object({
        display_name: displayName,
        passphrase: passphrase,
        passphrase_confirm: z.string(),
    })
    .refine((d: { passphrase: string; passphrase_confirm: string }) => d.passphrase === d.passphrase_confirm, {
        message: "Passphrases do not match",
        path: ["passphrase_confirm"],
    });

/** Server-side API validation (no confirmation field) */
export const InitialSetupSchema = z.object({
    display_name: displayName,
    passphrase: passphrase,
});

// ─── Owner Setup (passphrase only) ──────────────────────────────────

/** Client-side form validation (includes passphrase confirmation) */
export const UserSetupFormSchema = z
    .object({
        passphrase: passphrase,
        passphrase_confirm: z.string(),
    })
    .refine((d: { passphrase: string; passphrase_confirm: string }) => d.passphrase === d.passphrase_confirm, {
        message: "Passphrases do not match",
        path: ["passphrase_confirm"],
    });

/** Server-side API validation (no confirmation field, includes invite fields) */
export const UserSetupSchema = z.object({
    invite_id: z.string().min(1, "invite_id is required"),
    invite_token: z.string().min(1, "invite_token is required"),
    passphrase: passphrase,
});

// ─── User Login ─────────────────────────────────────────────────────

export const UserLoginSchema = z.object({
    user_principal_id: uuid,
    passphrase: z.string().min(1, "Passphrase is required"),
});

// ─── Profile: Display Name ──────────────────────────────────────────

export const UpdateDisplayNameSchema = z.object({
    display_name: displayName,
});

// ─── Profile: Contact Identity ──────────────────────────────────────

export const AddContactSchema = z.object({
    type: z.enum(["EMAIL", "PHONE", "INSTANT_MESSAGE", "SOCIAL_MEDIA"]),
    value: z.string().trim().min(1, "Value is required"),
    label: z.string().trim().optional(),
    platform: z.string().trim().optional(),
});

// ─── Profile: Government ID ────────────────────────────────────────

const EU_COUNTRY_CODES = [
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
] as const;

export const AddGovernmentIdSchema = z.object({
    country: z.enum(EU_COUNTRY_CODES, { message: "Country is required" }),
    id_type: z.string().min(1, "ID type is required"),
    id_value: z.string().trim().min(1, "ID value is required"),
});

// ─── Profile: Company ID ───────────────────────────────────────────

export const AddCompanyIdSchema = z.object({
    id_type: z.enum(["COMPANY_REG", "VAT", "EORI", "LEI", "DUNS"]),
    country: z.string().optional(),
    id_value: z.string().trim().min(1, "ID value is required"),
});

// ─── Profile: TOTP ─────────────────────────────────────────────────

export const TotpVerifySchema = z.object({
    code: totpCode,
});

// ─── Admin: Create User ─────────────────────────────────────────────

export const CreateUserSchema = z.object({
    display_name: displayName,
});

// ─── Admin: Create Organization ─────────────────────────────────────

export const CreateOrgSchema = z.object({
    display_name: displayName,
    created_by_user_id: uuid,
    slug: z.string().trim().min(3).max(40).optional(),
});

// ─── Admin: Agent Invite ───────────────────────────────────────────

export const AgentInviteSchema = z.object({
    owner_type: z.enum(["user", "org"]),
    owner_id: uuid,
});

// ─── Policy Editor ─────────────────────────────────────────────────

export const SavePolicySchema = z.object({
    policy_yaml: z.string().min(1, "Policy YAML is required").optional(),
    name: z.string().trim().nullable().optional(),
    description: z.string().trim().nullable().optional(),
});
