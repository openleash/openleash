import { renderPage, escapeHtml } from '../layout.js';
import type { TaxonomyNode } from '@openleash/core';

export interface PolicyBuilderOptions {
  taxonomy: TaxonomyNode[];
  owners: { owner_principal_id: string; display_name: string }[];
  agents: { agent_principal_id: string; agent_id: string; owner_principal_id: string }[];
  /** If editing an existing policy, pre-populate the builder */
  existing?: {
    policy_id: string;
    policy_yaml: string;
  };
}

function renderTreeNodes(nodes: TaxonomyNode[], depth: number = 0): string {
  return nodes.map((node) => {
    const hasChildren = node.children && node.children.length > 0;
    const indent = depth * 24;
    const pathAttr = escapeHtml(node.path);
    const constraintsAttr = node.suggestedConstraints
      ? escapeHtml(JSON.stringify(node.suggestedConstraints))
      : '';

    return `
      <div class="tree-node" data-path="${pathAttr}" data-depth="${depth}" style="padding-left:${indent}px"
           ${constraintsAttr ? `data-suggested-constraints="${constraintsAttr}"` : ''}>
        <div class="tree-node-row">
          ${hasChildren ? `<button class="tree-toggle" onclick="toggleExpand('${pathAttr}')" title="Expand/collapse">&#9654;</button>` : '<span class="tree-toggle-spacer"></span>'}
          <span class="tree-node-label" title="${escapeHtml(node.description ?? '')}">
            ${escapeHtml(node.label)}
            <span class="tree-node-path">${pathAttr}</span>
          </span>
          <span class="tree-node-inherited" id="inherited-${pathAttr.replace(/\./g, '-')}"></span>
          <div class="tree-node-controls" id="controls-${pathAttr.replace(/\./g, '-')}">
            <button class="tree-btn tree-btn-deny" onclick="setNodeEffect('${pathAttr}', 'deny')" title="Deny">DENY</button>
            <button class="tree-btn tree-btn-allow" onclick="setNodeEffect('${pathAttr}', 'allow')" title="Allow">ALLOW</button>
            ${hasChildren ? `<button class="tree-btn tree-btn-custom" onclick="setNodeEffect('${pathAttr}', 'custom')" title="Configure children individually">CUSTOM</button>` : ''}
            <button class="tree-btn tree-btn-clear" onclick="clearNodeEffect('${pathAttr}')" title="Inherit from parent">&#10005;</button>
          </div>
        </div>
        <div class="tree-node-constraints hidden" id="constraints-${pathAttr.replace(/\./g, '-')}">
          <div class="constraint-panel">
            <div class="constraint-row">
              <label>Max Amount</label>
              <input type="number" class="form-input constraint-input" data-path="${pathAttr}" data-constraint="amount_max" placeholder="e.g. 10000" onchange="updateConstraint('${pathAttr}', 'amount_max', this.value)">
            </div>
            <div class="constraint-row">
              <label>Allowed Domains</label>
              <input type="text" class="form-input constraint-input" data-path="${pathAttr}" data-constraint="allowed_domains" placeholder="comma-separated, e.g. example.com, corp.net" onchange="updateConstraint('${pathAttr}', 'allowed_domains', this.value)">
            </div>
            <div class="constraint-row">
              <label>Require Approval</label>
              <select class="form-select constraint-input" data-path="${pathAttr}" data-constraint="obligation" onchange="updateObligation('${pathAttr}', this.value)">
                <option value="">None</option>
                <option value="HUMAN_APPROVAL">Human Approval</option>
                <option value="STEP_UP_AUTH">Step-Up Auth</option>
              </select>
            </div>
          </div>
        </div>
        ${hasChildren ? `<div class="tree-children hidden" id="children-${pathAttr.replace(/\./g, '-')}">${renderTreeNodes(node.children!, depth + 1)}</div>` : ''}
      </div>
    `;
  }).join('');
}

export function renderPolicyBuilder(options: PolicyBuilderOptions): string {
  const { taxonomy, owners, agents, existing } = options;

  const ownerOptions = owners.map((o) =>
    `<option value="${escapeHtml(o.owner_principal_id)}">${escapeHtml(o.display_name)} (${escapeHtml(o.owner_principal_id.slice(0, 8))}...)</option>`
  ).join('');

  const agentOptions = agents.map((a) =>
    `<option value="${escapeHtml(a.agent_principal_id)}">${escapeHtml(a.agent_id)} (${escapeHtml(a.agent_principal_id.slice(0, 8))}...)</option>`
  ).join('');

  const treeHtml = renderTreeNodes(taxonomy);

  const content = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2>${existing ? 'Edit Policy (Visual Builder)' : 'Visual Policy Builder'}</h2>
        <p>Configure permissions using the action taxonomy tree</p>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/gui/policies" class="btn btn-secondary">Back to Policies</a>
      </div>
    </div>

    <div id="alert-container"></div>

    ${!existing ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-title">Policy Target</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group" style="margin-bottom:0">
          <label for="builder-owner">Owner</label>
          <select id="builder-owner" class="form-select">
            <option value="" disabled selected>Select an owner</option>
            ${ownerOptions}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label for="builder-agent">Applies To Agent</label>
          <select id="builder-agent" class="form-select">
            <option value="">All agents for this owner</option>
            ${agentOptions}
          </select>
        </div>
      </div>
    </div>
    ` : ''}

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="card-title" style="margin-bottom:0">Permission Tree</div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="mode-toggle">
            <button class="mode-btn active" id="mode-simple" onclick="setMode('simple')">Simple</button>
            <button class="mode-btn" id="mode-advanced" onclick="setMode('advanced')">Advanced</button>
          </div>
          <div style="margin-left:16px;display:flex;align-items:center;gap:8px">
            <label style="font-size:12px;color:var(--text-secondary);text-transform:none;letter-spacing:normal">Default:</label>
            <select id="default-policy" class="form-select" style="width:auto;padding:4px 28px 4px 8px;font-size:12px" onchange="updateDefault(this.value)">
              <option value="deny" selected>Deny All</option>
              <option value="allow">Allow All</option>
            </select>
          </div>
        </div>
      </div>

      <div id="allow-all-warning" class="alert alert-error hidden" style="margin-bottom:16px">
        Warning: "Allow All" default means any action not explicitly denied will be permitted. This is not recommended for production use.
      </div>

      <div id="tree-container">
        ${treeHtml}
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Generated Policy YAML</div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="toggleYamlPreview()">Toggle Preview</button>
      </div>
      <div id="yaml-preview-container">
        <pre id="yaml-preview" class="config-block" style="max-height:400px;overflow:auto;margin-bottom:0"></pre>
      </div>
    </div>

    <div class="toolbar" style="margin-top:4px">
      <button id="save-btn" class="btn btn-primary" onclick="saveBuilderPolicy()">${existing ? 'Save Policy' : 'Create Policy'}</button>
      <a href="/gui/policies" class="btn btn-secondary">Cancel</a>
      <span id="save-status" style="font-size:12px;color:var(--text-muted)"></span>
    </div>

    <script>
      // --- Builder State ---
      var builderState = {
        defaultPolicy: 'deny',
        mode: 'simple',
        nodes: {},       // { 'communication': { effect: 'allow', constraints: {}, obligation: null }, ... }
        existingPolicyId: ${existing ? `'${escapeHtml(existing.policy_id)}'` : 'null'},
      };

      // Taxonomy data (paths for lookup)
      var taxonomyPaths = ${JSON.stringify(flattenPaths(taxonomy))};

      function flattenNodes(nodes, parent) {
        var result = [];
        for (var i = 0; i < nodes.length; i++) {
          result.push({ path: nodes[i].path, parent: parent, hasChildren: !!(nodes[i].children && nodes[i].children.length) });
          if (nodes[i].children) {
            result = result.concat(flattenNodes(nodes[i].children, nodes[i].path));
          }
        }
        return result;
      }

      var allNodes = flattenNodes(${JSON.stringify(taxonomy.map(stripForClient))}, null);

      // --- Mode Toggle ---
      function setMode(mode) {
        builderState.mode = mode;
        document.getElementById('mode-simple').classList.toggle('active', mode === 'simple');
        document.getElementById('mode-advanced').classList.toggle('active', mode === 'advanced');

        // In simple mode, collapse all children and hide constraint panels
        var childDivs = document.querySelectorAll('.tree-children');
        var constraintDivs = document.querySelectorAll('.tree-node-constraints');

        if (mode === 'simple') {
          for (var i = 0; i < childDivs.length; i++) childDivs[i].classList.add('hidden');
          for (var i = 0; i < constraintDivs.length; i++) constraintDivs[i].classList.add('hidden');
          // Reset toggles
          var toggles = document.querySelectorAll('.tree-toggle');
          for (var i = 0; i < toggles.length; i++) toggles[i].classList.remove('expanded');
          // Hide custom buttons in simple mode
          var customBtns = document.querySelectorAll('.tree-btn-custom');
          for (var i = 0; i < customBtns.length; i++) customBtns[i].style.display = 'none';
          // Show only top-level nodes
          var treeNodes = document.querySelectorAll('.tree-node');
          for (var i = 0; i < treeNodes.length; i++) {
            var depth = parseInt(treeNodes[i].getAttribute('data-depth'));
            if (depth > 0) treeNodes[i].style.display = 'none';
            else treeNodes[i].style.display = '';
          }
        } else {
          // Show custom buttons
          var customBtns = document.querySelectorAll('.tree-btn-custom');
          for (var i = 0; i < customBtns.length; i++) customBtns[i].style.display = '';
          // Show all tree nodes (visibility controlled by parent expand state)
          var treeNodes = document.querySelectorAll('.tree-node');
          for (var i = 0; i < treeNodes.length; i++) treeNodes[i].style.display = '';
          // Restore expanded state
          refreshExpandState();
        }
      }

      function refreshExpandState() {
        for (var path in builderState.nodes) {
          if (builderState.nodes[path].effect === 'custom') {
            var childDiv = document.getElementById('children-' + path.replace(/\\./g, '-'));
            if (childDiv) childDiv.classList.remove('hidden');
            var toggle = childDiv ? childDiv.parentElement.querySelector('.tree-toggle') : null;
            if (toggle) toggle.classList.add('expanded');
          }
        }
      }

      // --- Tree Expand/Collapse ---
      function toggleExpand(path) {
        var id = 'children-' + path.replace(/\\./g, '-');
        var childDiv = document.getElementById(id);
        if (!childDiv) return;
        var toggle = childDiv.parentElement.querySelector('.tree-toggle');
        if (childDiv.classList.contains('hidden')) {
          childDiv.classList.remove('hidden');
          if (toggle) toggle.classList.add('expanded');
        } else {
          childDiv.classList.add('hidden');
          if (toggle) toggle.classList.remove('expanded');
        }
      }

      // --- Default Policy ---
      function updateDefault(val) {
        builderState.defaultPolicy = val;
        document.getElementById('allow-all-warning').classList.toggle('hidden', val !== 'allow');
        updateAllInherited();
        generateYaml();
      }

      // --- Node Effect ---
      function setNodeEffect(path, effect) {
        if (!builderState.nodes[path]) {
          builderState.nodes[path] = { effect: effect, constraints: {}, obligation: null };
        } else {
          builderState.nodes[path].effect = effect;
        }

        updateNodeUI(path);

        // If custom, expand children in advanced mode
        if (effect === 'custom' && builderState.mode === 'advanced') {
          var childDiv = document.getElementById('children-' + path.replace(/\\./g, '-'));
          if (childDiv) {
            childDiv.classList.remove('hidden');
            var toggle = childDiv.parentElement.querySelector('.tree-toggle');
            if (toggle) toggle.classList.add('expanded');
          }
        }

        // If allow/deny on a parent, clear child overrides
        if (effect === 'allow' || effect === 'deny') {
          clearChildOverrides(path);
        }

        updateAllInherited();
        generateYaml();
      }

      function clearNodeEffect(path) {
        delete builderState.nodes[path];
        // Also clear constraint inputs
        var inputs = document.querySelectorAll('.constraint-input[data-path="' + path + '"]');
        for (var i = 0; i < inputs.length; i++) inputs[i].value = '';
        // Hide constraint panel
        var cp = document.getElementById('constraints-' + path.replace(/\\./g, '-'));
        if (cp) cp.classList.add('hidden');

        updateNodeUI(path);
        updateAllInherited();
        generateYaml();
      }

      function clearChildOverrides(parentPath) {
        var toRemove = [];
        for (var p in builderState.nodes) {
          if (p.startsWith(parentPath + '.')) toRemove.push(p);
        }
        for (var i = 0; i < toRemove.length; i++) {
          delete builderState.nodes[toRemove[i]];
          updateNodeUI(toRemove[i]);
        }
      }

      function getInheritedEffect(path) {
        // Walk up the path to find the nearest parent with an explicit effect
        var parts = path.split('.');
        for (var i = parts.length - 1; i >= 1; i--) {
          var parentPath = parts.slice(0, i).join('.');
          var parentNode = builderState.nodes[parentPath];
          if (parentNode && (parentNode.effect === 'allow' || parentNode.effect === 'deny')) {
            return parentNode.effect;
          }
        }
        return builderState.defaultPolicy;
      }

      function updateNodeUI(path) {
        var cssPath = path.replace(/\\./g, '-');
        var controls = document.getElementById('controls-' + cssPath);
        if (!controls) return;

        var btns = controls.querySelectorAll('.tree-btn');
        for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');

        var nodeState = builderState.nodes[path];
        if (nodeState) {
          var effect = nodeState.effect;
          var activeBtn = controls.querySelector('.tree-btn-' + effect);
          if (activeBtn) activeBtn.classList.add('active');

          // Show constraints panel for allow in advanced mode
          var cp = document.getElementById('constraints-' + cssPath);
          if (cp && effect === 'allow' && builderState.mode === 'advanced') {
            cp.classList.remove('hidden');
          } else if (cp) {
            cp.classList.add('hidden');
          }
        } else {
          // No explicit state — hide constraints
          var cp = document.getElementById('constraints-' + cssPath);
          if (cp) cp.classList.add('hidden');
        }
      }

      function updateAllInherited() {
        for (var i = 0; i < allNodes.length; i++) {
          var path = allNodes[i].path;
          var cssPath = path.replace(/\\./g, '-');
          var el = document.getElementById('inherited-' + cssPath);
          if (!el) continue;

          var nodeState = builderState.nodes[path];
          if (nodeState) {
            el.textContent = '';
            el.className = 'tree-node-inherited';
          } else {
            var inherited = getInheritedEffect(path);
            el.textContent = 'inherited: ' + inherited.toUpperCase();
            el.className = 'tree-node-inherited inherited-' + inherited;
          }
        }
      }

      // --- Constraints ---
      function updateConstraint(path, key, value) {
        if (!builderState.nodes[path]) {
          builderState.nodes[path] = { effect: 'allow', constraints: {}, obligation: null };
        }
        if (!builderState.nodes[path].constraints) {
          builderState.nodes[path].constraints = {};
        }

        if (value === '' || value === null || value === undefined) {
          delete builderState.nodes[path].constraints[key];
        } else if (key === 'amount_max' || key === 'amount_min') {
          builderState.nodes[path].constraints[key] = parseFloat(value);
        } else if (key === 'allowed_domains' || key === 'blocked_domains') {
          builderState.nodes[path].constraints[key] = value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        } else {
          builderState.nodes[path].constraints[key] = value;
        }

        generateYaml();
      }

      function updateObligation(path, value) {
        if (!builderState.nodes[path]) {
          builderState.nodes[path] = { effect: 'allow', constraints: {}, obligation: null };
        }
        builderState.nodes[path].obligation = value || null;
        generateYaml();
      }

      // --- YAML Generation ---
      function generateYaml() {
        var lines = [];
        lines.push('version: 1');
        lines.push('default: ' + builderState.defaultPolicy);
        lines.push('rules:');

        var ruleCount = 0;
        var nodeKeys = Object.keys(builderState.nodes).sort();

        for (var i = 0; i < nodeKeys.length; i++) {
          var path = nodeKeys[i];
          var node = builderState.nodes[path];
          if (!node || node.effect === 'custom') continue;

          // Skip if this node's effect matches what it would inherit
          var inherited = getInheritedEffect(path);
          // For top-level nodes, check against default
          var parts = path.split('.');
          if (parts.length === 1) {
            if (node.effect === builderState.defaultPolicy) continue;
          } else if (node.effect === inherited) {
            continue;
          }

          ruleCount++;
          var ruleId = path.replace(/\\./g, '_') + '_' + node.effect;
          lines.push('  - id: ' + ruleId);
          lines.push('    effect: ' + node.effect);

          // If this node has children in the taxonomy, use wildcard pattern
          var nodeInfo = allNodes.find(function(n) { return n.path === path; });
          if (nodeInfo && nodeInfo.hasChildren) {
            lines.push('    action: "' + path + '.*"');
          } else {
            lines.push('    action: "' + path + '"');
          }

          lines.push('    description: "' + (node.effect === 'allow' ? 'Allow' : 'Deny') + ' ' + path.replace(/\\./g, ' > ') + '"');

          // Constraints
          var constraints = node.constraints || {};
          var constraintKeys = Object.keys(constraints).filter(function(k) {
            var v = constraints[k];
            if (v === null || v === undefined || v === '') return false;
            if (Array.isArray(v) && v.length === 0) return false;
            return true;
          });

          if (constraintKeys.length > 0) {
            lines.push('    constraints:');
            for (var j = 0; j < constraintKeys.length; j++) {
              var ck = constraintKeys[j];
              var cv = constraints[ck];
              if (Array.isArray(cv)) {
                lines.push('      ' + ck + ':');
                for (var k = 0; k < cv.length; k++) {
                  lines.push('        - "' + cv[k] + '"');
                }
              } else {
                lines.push('      ' + ck + ': ' + cv);
              }
            }
          }

          // Obligations
          if (node.obligation) {
            if (node.obligation === 'HUMAN_APPROVAL') {
              lines.push('    obligations:');
              lines.push('      - type: HUMAN_APPROVAL');
              lines.push('        description: "Requires human approval"');
            } else if (node.obligation === 'STEP_UP_AUTH') {
              lines.push('    requirements:');
              lines.push('      step_up_auth: true');
            }
          }
        }

        if (ruleCount === 0) {
          lines.push('  []');
        }

        var yaml = lines.join('\\n');
        document.getElementById('yaml-preview').textContent = yaml;
        return yaml;
      }

      function toggleYamlPreview() {
        var container = document.getElementById('yaml-preview-container');
        container.classList.toggle('hidden');
      }

      // --- Save ---
      async function saveBuilderPolicy() {
        var btn = document.getElementById('save-btn');
        var alertContainer = document.getElementById('alert-container');
        alertContainer.innerHTML = '';

        var yaml = generateYaml();

        if (builderState.existingPolicyId) {
          // Update existing policy
          btn.disabled = true;
          btn.textContent = 'Saving...';

          try {
            var res = await fetch('/v1/admin/policies/' + builderState.existingPolicyId, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ policy_yaml: yaml }),
            });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || 'Failed to save');
            alertContainer.innerHTML = '<div class="alert alert-success">Policy saved successfully</div>';
            setTimeout(function() { alertContainer.innerHTML = ''; }, 3000);
          } catch (err) {
            alertContainer.innerHTML = '<div class="alert alert-error">' + String(err.message || err).replace(/</g, '&lt;') + '</div>';
          } finally {
            btn.disabled = false;
            btn.textContent = 'Save Policy';
          }
        } else {
          // Create new policy
          var ownerId = document.getElementById('builder-owner').value;
          var agentId = document.getElementById('builder-agent').value || null;

          if (!ownerId) {
            alertContainer.innerHTML = '<div class="alert alert-error">Please select an owner</div>';
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Creating...';

          try {
            var res = await fetch('/v1/admin/policies', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                owner_principal_id: ownerId,
                applies_to_agent_principal_id: agentId,
                policy_yaml: yaml,
              }),
            });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || 'Failed to create policy');
            alertContainer.innerHTML = '<div class="alert alert-success">Policy created (ID: ' + data.policy_id.slice(0, 8).replace(/</g, '&lt;') + '...). Redirecting...</div>';
            setTimeout(function() { window.location.href = '/gui/policies'; }, 1000);
          } catch (err) {
            alertContainer.innerHTML = '<div class="alert alert-error">' + String(err.message || err).replace(/</g, '&lt;') + '</div>';
          } finally {
            btn.disabled = false;
            btn.textContent = 'Create Policy';
          }
        }
      }

      // --- Init ---
      (function init() {
        setMode('simple');
        updateAllInherited();
        generateYaml();
      })();
    </script>
  `;

  return renderPage(
    existing ? 'Edit Policy (Visual)' : 'Visual Policy Builder',
    content,
    '/gui/policies'
  );
}

/** Strip taxonomy tree for client-side use (only path + children structure). */
function stripForClient(node: TaxonomyNode): { path: string; children?: ReturnType<typeof stripForClient>[] } {
  const result: { path: string; children?: ReturnType<typeof stripForClient>[] } = { path: node.path };
  if (node.children && node.children.length > 0) {
    result.children = node.children.map(stripForClient);
  }
  return result;
}

/** Flatten all paths from taxonomy for server-side JSON injection. */
function flattenPaths(nodes: TaxonomyNode[]): string[] {
  const paths: string[] = [];
  function walk(n: TaxonomyNode[]) {
    for (const node of n) {
      paths.push(node.path);
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return paths;
}
