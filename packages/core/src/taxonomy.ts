/**
 * Standard action taxonomy for hierarchical policy definitions.
 *
 * This taxonomy is purely advisory — a convention layer. The engine's
 * matchAction() already supports hierarchical prefix matching, so
 * `communication.*` matches `communication.email.send`. Users can
 * still use any freeform action string.
 */

export interface TaxonomyNode {
  /** Dot-separated path, e.g. "communication.email.send" */
  path: string;
  /** Human-readable label, e.g. "Send Email" */
  label: string;
  /** Tooltip / help text */
  description?: string;
  /** Child nodes */
  children?: TaxonomyNode[];
  /** Context-sensitive constraint fields applicable to this action */
  suggestedConstraints?: string[];
}

export const ACTION_TAXONOMY: TaxonomyNode[] = [
  {
    path: 'communication',
    label: 'Communication',
    description: 'Sending and receiving messages across channels',
    children: [
      {
        path: 'communication.email',
        label: 'Email',
        description: 'Email operations',
        children: [
          { path: 'communication.email.send', label: 'Send Email', description: 'Send an email message', suggestedConstraints: ['allowed_domains', 'blocked_domains'] },
          { path: 'communication.email.read', label: 'Read Email', description: 'Read email messages' },
          { path: 'communication.email.delete', label: 'Delete Email', description: 'Delete email messages' },
        ],
      },
      {
        path: 'communication.sms',
        label: 'SMS',
        description: 'Text message operations',
        children: [
          { path: 'communication.sms.send', label: 'Send SMS', description: 'Send a text message' },
          { path: 'communication.sms.read', label: 'Read SMS', description: 'Read text messages' },
        ],
      },
      {
        path: 'communication.phone',
        label: 'Phone',
        description: 'Phone call operations',
        children: [
          { path: 'communication.phone.call', label: 'Make Call', description: 'Initiate a phone call' },
        ],
      },
      {
        path: 'communication.social',
        label: 'Social Media',
        description: 'Social media interactions',
        children: [
          { path: 'communication.social.post', label: 'Post', description: 'Publish a social media post' },
          { path: 'communication.social.message', label: 'Direct Message', description: 'Send a direct message' },
        ],
      },
    ],
  },
  {
    path: 'commerce',
    label: 'Commerce',
    description: 'Buying, selling, and transacting',
    children: [
      { path: 'commerce.purchase', label: 'Purchase', description: 'Buy a product or service', suggestedConstraints: ['amount_max', 'amount_min', 'currency'] },
      { path: 'commerce.sell', label: 'Sell', description: 'Sell a product or service', suggestedConstraints: ['amount_max', 'amount_min', 'currency'] },
      { path: 'commerce.subscribe', label: 'Subscribe', description: 'Start a subscription', suggestedConstraints: ['amount_max', 'currency'] },
      { path: 'commerce.return', label: 'Return', description: 'Return a purchased item' },
      { path: 'commerce.cancel', label: 'Cancel Order', description: 'Cancel an existing order' },
    ],
  },
  {
    path: 'finance',
    label: 'Finance',
    description: 'Financial operations and transactions',
    children: [
      { path: 'finance.payment', label: 'Payment', description: 'Make a payment', suggestedConstraints: ['amount_max', 'amount_min', 'currency'] },
      { path: 'finance.transfer', label: 'Transfer', description: 'Transfer funds between accounts', suggestedConstraints: ['amount_max', 'amount_min', 'currency'] },
      {
        path: 'finance.investment',
        label: 'Investment',
        description: 'Investment operations',
        children: [
          { path: 'finance.investment.buy', label: 'Buy Investment', description: 'Purchase an investment', suggestedConstraints: ['amount_max', 'currency'] },
          { path: 'finance.investment.sell', label: 'Sell Investment', description: 'Sell an investment', suggestedConstraints: ['amount_max', 'currency'] },
        ],
      },
      { path: 'finance.account.open', label: 'Open Account', description: 'Open a new financial account' },
    ],
  },
  {
    path: 'data',
    label: 'Data',
    description: 'Reading, sharing, and managing data',
    children: [
      {
        path: 'data.personal',
        label: 'Personal Data',
        description: 'Personal information operations',
        children: [
          { path: 'data.personal.read', label: 'Read Personal Data', description: 'Access personal information' },
          { path: 'data.personal.share', label: 'Share Personal Data', description: 'Share personal information with third parties', suggestedConstraints: ['allowed_domains'] },
          { path: 'data.personal.delete', label: 'Delete Personal Data', description: 'Remove personal information' },
        ],
      },
      {
        path: 'data.business',
        label: 'Business Data',
        description: 'Business information operations',
        children: [
          { path: 'data.business.export', label: 'Export Business Data', description: 'Export business data' },
          { path: 'data.business.import', label: 'Import Business Data', description: 'Import business data' },
        ],
      },
    ],
  },
  {
    path: 'web',
    label: 'Web',
    description: 'Web browsing and interaction',
    children: [
      { path: 'web.browse', label: 'Browse', description: 'Browse web pages', suggestedConstraints: ['allowed_domains', 'blocked_domains'] },
      { path: 'web.form', label: 'Submit Form', description: 'Fill and submit a web form', suggestedConstraints: ['allowed_domains'] },
      {
        path: 'web.account',
        label: 'Web Accounts',
        description: 'Web account management',
        children: [
          { path: 'web.account.create', label: 'Create Account', description: 'Create a new web account', suggestedConstraints: ['allowed_domains'] },
          { path: 'web.account.delete', label: 'Delete Account', description: 'Delete a web account' },
        ],
      },
      { path: 'web.download', label: 'Download', description: 'Download files from the web' },
    ],
  },
  {
    path: 'scheduling',
    label: 'Scheduling',
    description: 'Calendar and scheduling operations',
    children: [
      {
        path: 'scheduling.appointment',
        label: 'Appointments',
        description: 'Appointment management',
        children: [
          { path: 'scheduling.appointment.book', label: 'Book Appointment', description: 'Schedule an appointment' },
          { path: 'scheduling.appointment.cancel', label: 'Cancel Appointment', description: 'Cancel an appointment' },
        ],
      },
      {
        path: 'scheduling.calendar',
        label: 'Calendar',
        description: 'Calendar management',
        children: [
          { path: 'scheduling.calendar.create', label: 'Create Event', description: 'Create a calendar event' },
          { path: 'scheduling.calendar.modify', label: 'Modify Event', description: 'Modify a calendar event' },
        ],
      },
      { path: 'scheduling.reminder.set', label: 'Set Reminder', description: 'Create a reminder' },
    ],
  },
  {
    path: 'legal',
    label: 'Legal',
    description: 'Legal documents and government interactions',
    children: [
      { path: 'legal.sign', label: 'Sign Document', description: 'Digitally sign a document' },
      {
        path: 'legal.government',
        label: 'Government',
        description: 'Government submissions and interactions',
        children: [
          { path: 'legal.government.submit', label: 'Submit to Government', description: 'Submit a form or document to a government entity' },
        ],
      },
      {
        path: 'legal.contract',
        label: 'Contracts',
        description: 'Contract management',
        children: [
          { path: 'legal.contract.accept', label: 'Accept Contract', description: 'Accept or sign a contract' },
          { path: 'legal.contract.terminate', label: 'Terminate Contract', description: 'Terminate an existing contract' },
        ],
      },
      { path: 'legal.document.notarize', label: 'Notarize Document', description: 'Notarize a legal document' },
    ],
  },
  {
    path: 'healthcare',
    label: 'Healthcare',
    description: 'Health records and medical operations',
    children: [
      {
        path: 'healthcare.records',
        label: 'Medical Records',
        description: 'Medical record operations',
        children: [
          { path: 'healthcare.records.read', label: 'Read Records', description: 'Access medical records' },
          { path: 'healthcare.records.share', label: 'Share Records', description: 'Share medical records with providers' },
        ],
      },
      { path: 'healthcare.appointment.book', label: 'Book Medical Appointment', description: 'Schedule a medical appointment' },
      { path: 'healthcare.prescription.request', label: 'Request Prescription', description: 'Request a prescription refill or new prescription' },
    ],
  },
  {
    path: 'system',
    label: 'System',
    description: 'System-level operations',
    children: [
      {
        path: 'system.file',
        label: 'File Operations',
        description: 'File system access',
        children: [
          { path: 'system.file.read', label: 'Read File', description: 'Read a file from the file system' },
          { path: 'system.file.write', label: 'Write File', description: 'Write or modify a file' },
          { path: 'system.file.delete', label: 'Delete File', description: 'Delete a file' },
        ],
      },
      { path: 'system.software.install', label: 'Install Software', description: 'Install or update software packages' },
      { path: 'system.config.modify', label: 'Modify Config', description: 'Modify system or application configuration' },
      { path: 'system.network.request', label: 'Network Request', description: 'Make an outbound network request', suggestedConstraints: ['allowed_domains', 'blocked_domains'] },
    ],
  },
];

// Build a lookup index on first access
let _index: Map<string, TaxonomyNode> | null = null;

function buildIndex(): Map<string, TaxonomyNode> {
  if (_index) return _index;
  _index = new Map();

  function walk(nodes: TaxonomyNode[]) {
    for (const node of nodes) {
      _index!.set(node.path, node);
      if (node.children) walk(node.children);
    }
  }

  walk(ACTION_TAXONOMY);
  return _index;
}

/** Look up a taxonomy node by its dot-separated path. */
export function getTaxonomyNode(path: string): TaxonomyNode | undefined {
  return buildIndex().get(path);
}

/** Get the immediate children of a node (empty array if leaf or unknown). */
export function getTaxonomyChildren(path: string): TaxonomyNode[] {
  const node = buildIndex().get(path);
  return node?.children ?? [];
}

/** Get all leaf descendants of a node (the node itself if it's a leaf). */
export function getTaxonomyDescendants(path: string): TaxonomyNode[] {
  const node = buildIndex().get(path);
  if (!node) return [];

  const leaves: TaxonomyNode[] = [];

  function collect(n: TaxonomyNode) {
    if (!n.children || n.children.length === 0) {
      leaves.push(n);
    } else {
      for (const child of n.children) collect(child);
    }
  }

  collect(node);
  return leaves;
}

/** Check whether a path exists in the standard taxonomy. */
export function isKnownAction(path: string): boolean {
  return buildIndex().has(path);
}

/** Get all top-level taxonomy categories. */
export function getTaxonomyCategories(): TaxonomyNode[] {
  return ACTION_TAXONOMY;
}

/** Flatten the entire taxonomy into a list of all nodes. */
export function flattenTaxonomy(): TaxonomyNode[] {
  const all: TaxonomyNode[] = [];

  function walk(nodes: TaxonomyNode[]) {
    for (const node of nodes) {
      all.push(node);
      if (node.children) walk(node.children);
    }
  }

  walk(ACTION_TAXONOMY);
  return all;
}
