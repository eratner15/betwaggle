// Minimal DOM morph — updates only changed nodes
// Replaces full innerHTML rebuild with surgical DOM diffing
// Preserves scroll position, focus, touch highlights, and animations
export function morph(existingEl, newHtml) {
  const temp = document.createElement('div');
  temp.innerHTML = newHtml;
  morphChildren(existingEl, temp);
}

function morphChildren(existing, incoming) {
  const existingNodes = Array.from(existing.childNodes);
  const incomingNodes = Array.from(incoming.childNodes);

  const max = Math.max(existingNodes.length, incomingNodes.length);
  for (let i = 0; i < max; i++) {
    const existNode = existingNodes[i];
    const newNode = incomingNodes[i];

    if (!existNode && newNode) {
      // New node added
      existing.appendChild(newNode.cloneNode(true));
    } else if (existNode && !newNode) {
      // Node removed — remove from end to avoid index shift issues
      existing.removeChild(existNode);
    } else if (existNode.nodeType !== newNode.nodeType) {
      // Different node types — full replace
      existing.replaceChild(newNode.cloneNode(true), existNode);
    } else if (existNode.nodeType === 3) {
      // Text node — update if changed
      if (existNode.textContent !== newNode.textContent) {
        existNode.textContent = newNode.textContent;
      }
    } else if (existNode.nodeType === 8) {
      // Comment node — update if changed
      if (existNode.data !== newNode.data) {
        existNode.data = newNode.data;
      }
    } else if (existNode.nodeType === 1) {
      // Element node
      if (existNode.tagName !== newNode.tagName) {
        // Different tags — full replace
        existing.replaceChild(newNode.cloneNode(true), existNode);
      } else {
        updateAttributes(existNode, newNode);
        morphChildren(existNode, newNode);
      }
    }
  }
}

function updateAttributes(existing, incoming) {
  // Remove attributes no longer present
  for (const attr of Array.from(existing.attributes)) {
    if (!incoming.hasAttribute(attr.name)) {
      existing.removeAttribute(attr.name);
    }
  }
  // Set new or changed attributes
  for (const attr of Array.from(incoming.attributes)) {
    if (existing.getAttribute(attr.name) !== attr.value) {
      existing.setAttribute(attr.name, attr.value);
    }
  }
}
