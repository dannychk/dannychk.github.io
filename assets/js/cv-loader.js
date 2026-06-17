(function () {
  const CONTENT_URL = "my_cv_content.toml";

  function stripComment(line) {
    let inString = false;
    let escaped = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (char === "#" && !inString) {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function countOutsideStrings(text, target) {
    let count = 0;
    let inString = false;
    let escaped = false;
    for (const char of text) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (char === target && !inString) {
        count += 1;
      }
    }
    return count;
  }

  function logicalLines(toml) {
    const output = [];
    let buffer = "";
    let bracketDepth = 0;

    for (const rawLine of toml.split(/\r?\n/)) {
      const line = stripComment(rawLine).trim();
      if (!line) continue;
      buffer = buffer ? `${buffer} ${line}` : line;
      bracketDepth += countOutsideStrings(line, "[") - countOutsideStrings(line, "]");
      if (bracketDepth <= 0) {
        output.push(buffer);
        buffer = "";
        bracketDepth = 0;
      }
    }

    if (buffer) output.push(buffer);
    return output;
  }

  function parseString(value) {
    return value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n");
  }

  function splitArray(value) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];

    const items = [];
    let current = "";
    let inString = false;
    let escaped = false;

    for (const char of inner) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        current += char;
        escaped = true;
        continue;
      }
      if (char === '"') {
        current += char;
        inString = !inString;
        continue;
      }
      if (char === "," && !inString) {
        items.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }

    if (current.trim()) items.push(current.trim());
    return items;
  }

  function parseValue(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return parseString(trimmed);
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) return splitArray(trimmed).map(parseValue);
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    return trimmed;
  }

  function parseToml(toml) {
    const root = {};
    let context = root;
    let currentSection = null;

    for (const line of logicalLines(toml)) {
      const tableArray = line.match(/^\[\[(.+)\]\]$/);
      if (tableArray) {
        const path = tableArray[1].trim();
        if (path === "sections") {
          root.sections = root.sections || [];
          currentSection = {};
          root.sections.push(currentSection);
          context = currentSection;
        } else if (path === "sections.items") {
          if (!currentSection) throw new Error("[[sections.items]] must follow [[sections]]");
          currentSection.items = currentSection.items || [];
          context = {};
          currentSection.items.push(context);
        } else {
          throw new Error(`Unsupported TOML table array: ${path}`);
        }
        continue;
      }

      const table = line.match(/^\[(.+)\]$/);
      if (table) {
        const path = table[1].trim();
        if (path !== "profile") throw new Error(`Unsupported TOML table: ${path}`);
        root.profile = root.profile || {};
        context = root.profile;
        continue;
      }

      const separator = line.indexOf("=");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      context[key] = parseValue(value);
    }

    return root;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function renderRow(leftClass, left, rightClass, right) {
    if (!left && !right) return null;
    const row = el("div", "cv-row");
    if (!right) row.classList.add("cv-row-single");
    row.appendChild(el("div", leftClass, left || ""));
    if (right) row.appendChild(el("div", rightClass, right));
    return row;
  }

  function renderItem(item) {
    const wrapper = el("article", "cv-item");
    const heading = renderRow("cv-heading", item.heading, "cv-location", item.location);
    const subheading = renderRow("cv-subheading", item.subheading, "cv-date", item.date);
    if (heading) wrapper.appendChild(heading);
    if (subheading) wrapper.appendChild(subheading);

    for (const line of item.lines || []) {
      wrapper.appendChild(el("p", "cv-line", line));
    }

    if (item.bullets && item.bullets.length) {
      const list = el("ul", "cv-bullets");
      for (const bullet of item.bullets) {
        list.appendChild(el("li", "", bullet));
      }
      wrapper.appendChild(list);
    }

    return wrapper;
  }

  function renderSection(section) {
    const node = el("section", "cv-section");
    node.appendChild(el("div", "cv-section-title", section.title || ""));
    const body = el("div", "cv-section-body");
    for (const item of section.items || []) {
      body.appendChild(renderItem(item));
    }
    node.appendChild(body);
    return node;
  }

  function renderHeader(profile) {
    const header = el("header", "cv-header");
    header.appendChild(el("h1", "cv-name", profile.name || ""));
    if (profile.contacts && profile.contacts.length) {
      const contacts = el("div", "cv-contacts");
      for (const contact of profile.contacts) {
        contacts.appendChild(el("span", "", contact));
      }
      header.appendChild(contacts);
    }
    return header;
  }

  function renderCv(data) {
    const root = document.getElementById("cv-root");
    root.textContent = "";

    const profile = data.profile || {};
    const sections = data.sections || [];
    const pages = Math.max(1, ...sections.map((section) => Number(section.page || 1)));

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = el("section", "cv-page");
      if (pageNumber === 1) page.appendChild(renderHeader(profile));

      for (const section of sections.filter((entry) => Number(entry.page || 1) === pageNumber)) {
        page.appendChild(renderSection(section));
      }

      page.appendChild(el("div", "cv-footer", `[${profile.footer || profile.title || ""}]`));
      page.appendChild(el("div", "cv-page-number", `Page ${pageNumber} of ${pages}`));
      root.appendChild(page);
    }
  }

  function renderError(error) {
    const root = document.getElementById("cv-root");
    root.textContent = "";
    const message = el("section", "cv-error");
    message.appendChild(el("h1", "", "Unable to load CV content"));
    message.appendChild(el("p", "", error.message || String(error)));
    root.appendChild(message);
  }

  fetch(CONTENT_URL, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${CONTENT_URL}: ${response.status}`);
      return response.text();
    })
    .then((text) => renderCv(parseToml(text)))
    .catch(renderError);
})();
