import * as crypto from 'node:crypto';
import {
  authorize as sdkAuthorize,
  createApprovalRequest as sdkCreateApprovalRequest,
  getApprovalRequest as sdkGetApprovalRequest,
} from '@openleash/sdk-ts';
import type {
  AuthClient,
  AuthorizeResult,
  CreateApprovalResult,
  GetApprovalResult,
  GloveConfig,
} from './types.js';

/**
 * Creates an AuthClient backed by the @openleash/sdk-ts functions.
 * The glove acts as an OpenLeash agent, signing every request with its
 * Ed25519 key and including a freshly-generated action_id and timestamp.
 */
export function createSdkAuthClient(config: GloveConfig): AuthClient {
  const { openleashUrl, agentId, privateKeyB64 } = config;

  return {
    async authorize(
      action: Record<string, unknown>,
      approvalToken?: string,
    ): Promise<AuthorizeResult> {
      const result = await sdkAuthorize({
        openleashUrl,
        agentId,
        privateKeyB64,
        action,
        approvalToken,
      });
      return result as unknown as AuthorizeResult;
    },

    async createApprovalRequest(
      decisionId: string,
      action: Record<string, unknown>,
      justification?: string,
    ): Promise<CreateApprovalResult> {
      const result = await sdkCreateApprovalRequest({
        openleashUrl,
        agentId,
        privateKeyB64,
        decisionId,
        action,
        justification,
      });
      return result as unknown as CreateApprovalResult;
    },

    async getApprovalRequest(approvalRequestId: string): Promise<GetApprovalResult> {
      const result = await sdkGetApprovalRequest({
        openleashUrl,
        agentId,
        privateKeyB64,
        approvalRequestId,
      });
      return result as unknown as GetApprovalResult;
    },
  };
}

/**
 * Builds an OpenLeash ActionRequest body for a given tool call.
 * The action_id is generated freshly so each call is uniquely traceable.
 */
export function buildActionRequest(params: {
  actionType: string;
  payload: Record<string, unknown>;
  agentId: string;
  subjectId: string;
}): Record<string, unknown> {
  return {
    action_id: crypto.randomUUID(),
    action_type: params.actionType,
    requested_at: new Date().toISOString(),
    principal: { agent_id: params.agentId },
    subject: { principal_id: params.subjectId },
    payload: params.payload,
  };
}
