/**
 * Stack Perfeita MCP — Policy Generator
 * Generates structured content-safety policies with taxonomy classification.
 * Provides a 6-step workflow: classify → map → expand → cross-cut → output → save.
 */

import { z } from "zod";
import { atomicWrite } from "./helpers.js";

// ─── Severity Model ──────────────────────────────────────────────────────────

const SEVERITY = {
  S0: { label: "Safe", description: "No restrictions" },
  S1: { label: "Low risk", description: "Mild content" },
  S2: { label: "Medium risk", description: "Sensitive content" },
  S3: { label: "High risk", description: "Restricted content" },
  S4: { label: "Catastrophic", description: "Never allow" },
};

const VALID_SEVERITIES = Object.keys(SEVERITY);

// ─── Taxonomy ────────────────────────────────────────────────────────────────

const TAXONOMY = [
  { name: "violence", display_name: "Violence", definition: "Content depicting physical harm, assault, or graphic violence", in_scope: ["fictional combat", "news reporting", "medical descriptions"], out_of_scope: ["cartoon slapstick", "metaphorical use"], severity: "S3", examples_safe: ["historical account of battle", "medical textbook description of wound care"], examples_unsafe: ["detailed instructions for causing harm", "glorification of violence"], edge_cases: ["video game descriptions", "movie reviews mentioning violence"] },
  { name: "hate_speech", display_name: "Hate Speech", definition: "Content attacking or demeaning groups based on protected characteristics", in_scope: ["racial discrimination", "gender-based hate", "religious persecution"], out_of_scope: ["criticism of ideologies", "policy debates"], severity: "S4", examples_safe: ["educational content about civil rights", "documentary about discrimination"], examples_unsafe: ["slurs targeting ethnic groups", "calls for violence against minorities"], edge_cases: ["satire vs. hate", "academic study of hate speech"] },
  { name: "sexual_content", display_name: "Sexual Content", definition: "Sexually explicit or suggestive material", in_scope: ["erotica", "sexual health education", "dating advice"], out_of_scope: ["non-sexual nudity in art", "medical anatomy"], severity: "S2", examples_safe: ["sexual health information", "relationship advice"], examples_unsafe: ["explicit sexual descriptions", "unsolicited sexual advances"], edge_cases: ["artistic nudity", "age of consent discussions"] },
  { name: "self_harm", display_name: "Self-Harm", definition: "Content promoting, instructing, or glorifying self-injury", in_scope: ["suicide prevention", "mental health resources", "recovery stories"], out_of_scope: ["medical treatment of injuries", "first aid"], severity: "S4", examples_safe: ["crisis helpline information", "mental health awareness"], examples_unsafe: ["methods of self-harm", "suicide instructions"], edge_cases: ["cutting in fiction", "emo culture discussions"] },
  { name: "illegal_activity", display_name: "Illegal Activity", definition: "Content facilitating or promoting illegal acts", in_scope: ["drug manufacturing", "hacking", "theft", "fraud"], out_of_scope: ["legal activism", "civil disobedience education"], severity: "S3", examples_safe: ["documentary about organized crime", "law enforcement training"], examples_unsafe: ["instructions for making drugs", "tutorial for credit card fraud"], edge_cases: ["lockpicking as hobby", "copyright infringement discussion"] },
  { name: "misinformation", display_name: "Misinformation", definition: "False or misleading information that could cause harm", in_scope: ["health misinformation", "election misinformation", "conspiracy theories"], out_of_scope: ["opinions", "debates with evidence", "satire"], severity: "S2", examples_safe: ["fact-checking articles", "media literacy resources"], examples_unsafe: ["anti-vaccination claims", "election fraud conspiracy"], edge_cases: ["contested scientific claims", "opinions presented as fact"] },
  { name: "harassment", display_name: "Harassment", definition: "Targeted bullying, intimidation, or sustained unwanted contact", in_scope: ["cyberbullying", "stalking", "doxxing"], out_of_scope: ["legitimate criticism", "disagreement"], severity: "S3", examples_safe: ["anti-bullying resources", "reporting mechanisms"], examples_unsafe: ["personal attacks on individuals", "coordinated harassment campaigns"], edge_cases: ["public figure criticism", "satire of public figures"] },
  { name: "personal_info", display_name: "Personal Information", definition: "Private or sensitive personal data (PII)", in_scope: ["phone numbers", "addresses", "financial data", "medical records"], out_of_scope: ["publicly available contact info", "business addresses"], severity: "S3", examples_safe: ["privacy policy discussions", "data protection education"], examples_unsafe: ["sharing someone's home address", "publishing medical records"], edge_cases: ["celebrity personal info", "public records"] },
  { name: "spam", display_name: "Spam", definition: "Unsolicited bulk messaging or deceptive content", in_scope: ["email spam", "SEO manipulation", "fake reviews"], out_of_scope: ["legitimate marketing", "newsletters"], severity: "S1", examples_safe: ["spam detection resources", "email filtering education"], examples_unsafe: ["phishing email templates", "fake product reviews"], edge_cases: ["cold outreach", "affiliate marketing"] },
  { name: "copyright", display_name: "Copyright Violation", definition: "Unauthorized use or distribution of copyrighted material", in_scope: ["software piracy", "plagiarism", "illegal distribution"], out_of_scope: ["fair use", "Creative Commons content", "open source"], severity: "S2", examples_safe: ["fair use analysis", "copyright law education"], examples_unsafe: ["pirated software links", "full reproduction of copyrighted works"], edge_cases: ["fan fiction", "code snippets in answers"] },
  { name: "dangerous_content", display_name: "Dangerous Content", definition: "Content that could cause physical harm or danger", in_scope: ["weapons", "explosives", "toxic substances", "dangerous activities"], out_of_scope: ["safety equipment", "harm reduction"], severity: "S3", examples_safe: ["safety training materials", "harm reduction resources"], examples_unsafe: ["bomb-making instructions", "unregulated drug synthesis"], edge_cases: ["survival guides", "chemistry education"] },
  { name: "medical_advice", display_name: "Medical Advice", definition: "Specific medical diagnoses, treatments, or prescriptions", in_scope: ["diagnosis", "prescription advice", "treatment plans"], out_of_scope: ["general wellness tips", "health education"], severity: "S2", examples_safe: ["general health information", "symptom awareness"], examples_unsafe: ["specific dosage recommendations", "diagnosis without examination"], edge_cases: ["telemedicine", "health supplements"] },
  { name: "financial_advice", display_name: "Financial Advice", definition: "Specific investment, tax, or financial planning recommendations", in_scope: ["investment recommendations", "tax strategies", "loan advice"], out_of_scope: ["financial literacy education", "general budgeting tips"], severity: "S2", examples_safe: ["budgeting tips", "financial literacy education"], examples_unsafe: ["guaranteed investment returns", "tax evasion schemes"], edge_cases: ["cryptocurrency advice", "retirement planning"] },
  { name: "political_bias", display_name: "Political Bias", definition: "Content promoting a specific political agenda or candidate", in_scope: ["partisan propaganda", "voter manipulation", "lobbying"], out_of_scope: ["political analysis", "factual news reporting", "policy debates"], severity: "S1", examples_safe: ["balanced political analysis", "civic education"], examples_unsafe: ["voter suppression tactics", "political disinformation"], edge_cases: ["editorials", "advocacy journalism"] },
  { name: "child_safety", display_name: "Child Safety", definition: "Content that exploits, endangers, or is inappropriate for minors", in_scope: ["CSAM", "child exploitation", "grooming", "age-inappropriate content"], out_of_scope: ["parenting advice", "child development education"], severity: "S4", examples_safe: ["child safety resources", "online safety for kids"], examples_unsafe: ["any content sexualizing minors", "targeting minors with harmful content"], edge_cases: ["coming-of-age fiction", "health education for teens"] },
  { name: "animal_cruelty", display_name: "Animal Cruelty", definition: "Content depicting or promoting harm to animals", in_scope: ["animal abuse", "animal fighting", "neglect"], out_of_scope: ["animal husbandry", "veterinary medicine", "hunting"], severity: "S2", examples_safe: ["animal welfare advocacy", "veterinary education"], examples_unsafe: ["animal torture videos", "fighting instructions"], edge_cases: ["hunting discussions", "animal testing ethics"] },
  { name: "radicalization", display_name: "Radicalization", definition: "Content recruiting for or promoting extremist organizations", in_scope: ["terrorism recruitment", "extremist ideology", "radical pipelines"], out_of_scope: ["political activism", "social movements", "religion"], severity: "S4", examples_safe: ["counter-radicalization resources", "extremism research"], examples_unsafe: ["terrorist recruitment material", "extremist propaganda"], edge_cases: ["political dissent", "protest movements"] },
  { name: "deception", display_name: "Deception & Fraud", definition: "Content designed to deceive, scam, or defraud", in_scope: ["scams", "impersonation", "social engineering", "fake identities"], out_of_scope: ["magic tricks", "fictional deception"], severity: "S2", examples_safe: ["fraud awareness resources", "scam identification guides"], examples_unsafe: ["phishing scripts", "impersonation instructions"], edge_cases: ["satire", "fictional con artists"] },
  { name: "code_vulnerability", display_name: "Code Vulnerability", definition: "Content introducing security flaws or exploiting systems", in_scope: ["SQL injection", "buffer overflow", "privilege escalation", "backdoors"], out_of_scope: ["penetration testing education", "bug bounties", "security hardening"], severity: "S2", examples_safe: ["security audit reports", "vulnerability disclosure"], examples_unsafe: ["zero-day exploitation tutorials", "malware source code"], edge_cases: ["CTF challenges", "responsible disclosure"] },
  { name: "data_exfiltration", display_name: "Data Exfiltration", definition: "Techniques or tools for unauthorized data extraction", in_scope: ["data theft", "credential harvesting", "network sniffing"], out_of_scope: ["legitimate data analysis", "authorized security testing"], severity: "S3", examples_safe: ["data protection strategies", "incident response planning"], examples_unsafe: ["data theft tutorials", "credential stealing scripts"], edge_cases: ["OSINT techniques", "security research"] },
  { name: "social_manipulation", display_name: "Social Manipulation", definition: "Content designed to manipulate social systems or individuals", in_scope: ["social engineering", "gaslighting", "manipulation tactics"], out_of_scope: ["negotiation techniques", "persuasion education"], severity: "S2", examples_safe: ["manipulation awareness resources", "critical thinking education"], examples_unsafe: ["coercion techniques", "psychological manipulation scripts"], edge_cases: ["sales techniques", "influencer marketing"] },
  { name: "environmental_harm", display_name: "Environmental Harm", definition: "Content promoting environmental damage or ecological destruction", in_scope: ["pollution facilitation", "wildlife trafficking", "deforestation"], out_of_scope: ["environmental activism", "conservation", "sustainability"], severity: "S2", examples_safe: ["environmental education", "conservation resources"], examples_unsafe: ["illegal waste disposal instructions", "wildlife trafficking guides"], edge_cases: ["logging industry discussions", "farming practices"] },
];

// ─── Step 1: Content Classification ──────────────────────────────────────────

/**
 * Classify content against taxonomy categories.
 * Returns { type, category, confidence, matches }.
 */
export function classifyContent(content) {
  if (!content || typeof content !== "string") {
    return { type: "unknown", category: null, confidence: 0, matches: [] };
  }

  const lower = content.toLowerCase();
  const matches = [];

  for (const cat of TAXONOMY) {
    let score = 0;
    const nameWords = cat.name.replace(/_/g, " ");
    const defWords = cat.definition.toLowerCase();

    // Check name match
    if (lower.includes(nameWords)) score += 3;
    // Check definition keywords
    if (lower.includes(defWords)) score += 2;
    // Check in-scope terms
    for (const term of cat.in_scope) {
      if (lower.includes(term.toLowerCase())) score += 1;
    }
    // Check examples
    for (const ex of cat.examples_unsafe) {
      if (lower.includes(ex.toLowerCase())) score += 2;
    }

    if (score > 0) {
      matches.push({ name: cat.name, display_name: cat.display_name, score, severity: cat.severity });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return { type: "safe", category: null, confidence: 0, matches: [] };
  }

  const top = matches[0];
  const confidence = Math.min(top.score / 8, 1.0);

  return {
    type: top.severity === "S4" ? "restricted" : top.severity === "S3" ? "high-risk" : "moderate",
    category: top.name,
    confidence,
    matches,
  };
}

// ─── Step 2: Taxonomy Mapping ────────────────────────────────────────────────

/**
 * Map content to taxonomy categories (exact + fuzzy matches).
 * Returns array of matching taxonomy entries.
 */
export function mapToTaxonomy(content, customCategories = []) {
  if (!content || typeof content !== "string") return [];

  const lower = content.toLowerCase();
  const mapped = [];

  // Standard categories
  for (const cat of TAXONOMY) {
    const nameWords = cat.name.replace(/_/g, " ");
    if (
      lower.includes(nameWords) ||
      lower.includes(cat.definition.toLowerCase()) ||
      cat.in_scope.some((s) => lower.includes(s.toLowerCase()))
    ) {
      mapped.push(cat);
    }
  }

  // Custom categories
  for (const custom of customCategories) {
    if (custom && typeof custom === "string" && lower.includes(custom.toLowerCase())) {
      mapped.push({
        name: custom.toLowerCase().replace(/\s+/g, "_"),
        display_name: custom,
        definition: `Custom category: ${custom}`,
        in_scope: [],
        out_of_scope: [],
        severity: "S1",
        examples_safe: [],
        examples_unsafe: [],
        edge_cases: [],
      });
    }
  }

  return mapped;
}

// ─── Step 3: Expand Definitions ──────────────────────────────────────────────

/**
 * Expand a taxonomy entry with full scope details.
 * Returns enriched taxonomy object.
 */
export function expandDefinition(entry) {
  if (!entry || typeof entry !== "object") return null;

  return {
    name: entry.name,
    display_name: entry.display_name,
    definition: entry.definition || "No definition provided",
    in_scope: Array.isArray(entry.in_scope) ? entry.in_scope : [],
    out_of_scope: Array.isArray(entry.out_of_scope) ? entry.out_of_scope : [],
    severity: VALID_SEVERITIES.includes(entry.severity) ? entry.severity : "S1",
    severity_info: SEVERITY[entry.severity] || SEVERITY.S1,
    examples_safe: Array.isArray(entry.examples_safe) ? entry.examples_safe : [],
    examples_unsafe: Array.isArray(entry.examples_unsafe) ? entry.examples_unsafe : [],
    edge_cases: Array.isArray(entry.edge_cases) ? entry.edge_cases : [],
  };
}

// ─── Step 4: Cross-Cutting Sections ──────────────────────────────────────────

/**
 * Generate cross-cutting sections for a policy entry.
 */
export function generateCrossCutting(entry) {
  const expanded = expandDefinition(entry);
  if (!expanded) return null;

  return {
    ...expanded,
    enforcement: {
      severity: expanded.severity,
      severity_label: expanded.severity_info.label,
      response_actions: getResponseActions(expanded.severity),
      review_required: ["S3", "S4"].includes(expanded.severity),
      auto_block: expanded.severity === "S4",
    },
    examples_combined: {
      safe: expanded.examples_safe,
      unsafe: expanded.examples_unsafe,
      edge_cases: expanded.edge_cases,
    },
  };
}

/**
 * Get response actions for a severity level.
 */
function getResponseActions(severity) {
  switch (severity) {
    case "S0": return ["No action required"];
    case "S1": return ["Log for review", "Optional warning"];
    case "S2": return ["Flag for review", "Apply content warning"];
    case "S3": return ["Block by default", "Require explicit approval", "Audit log"];
    case "S4": return ["Immediate block", "Zero tolerance", "Escalate to human review"];
    default: return ["Unknown severity — escalate"];
  }
}

// ─── Step 5: Policy Output Generation ────────────────────────────────────────

/**
 * Generate Markdown policy from taxonomy entries.
 */
export function generateMarkdownPolicy(entries, title = "Content Safety Policy") {
  if (!Array.isArray(entries) || entries.length === 0) {
    return `# ${title}\n\nNo taxonomy entries provided.\n`;
  }

  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Categories: ${entries.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Category | Display Name | Severity | Auto-Block |");
  lines.push("|----------|--------------|----------|------------|");
  for (const entry of entries) {
    const expanded = expandDefinition(entry);
    lines.push(`| ${expanded.name} | ${expanded.display_name} | ${expanded.severity} | ${expanded.severity === "S4" ? "Yes" : "No"} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Detailed sections
  for (const entry of entries) {
    const crossCut = generateCrossCutting(entry);
    if (!crossCut) continue;

    lines.push(`## ${crossCut.display_name} (\`${crossCut.name}\`)`);
    lines.push("");
    lines.push(`**Severity:** ${crossCut.severity} — ${crossCut.severity_info.label}`);
    lines.push(`**Definition:** ${crossCut.definition}`);
    lines.push("");

    if (crossCut.in_scope.length > 0) {
      lines.push("### In Scope");
      for (const item of crossCut.in_scope) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    if (crossCut.out_of_scope.length > 0) {
      lines.push("### Out of Scope");
      for (const item of crossCut.out_of_scope) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    if (crossCut.examples_combined.safe.length > 0) {
      lines.push("### Safe Examples");
      for (const ex of crossCut.examples_combined.safe) {
        lines.push(`- ${ex}`);
      }
      lines.push("");
    }

    if (crossCut.examples_combined.unsafe.length > 0) {
      lines.push("### Unsafe Examples");
      for (const ex of crossCut.examples_combined.unsafe) {
        lines.push(`- ${ex}`);
      }
      lines.push("");
    }

    if (crossCut.examples_combined.edge_cases.length > 0) {
      lines.push("### Edge Cases");
      for (const ec of crossCut.examples_combined.edge_cases) {
        lines.push(`- ${ec}`);
      }
      lines.push("");
    }

    lines.push("### Enforcement");
    lines.push("");
    lines.push(`- **Response actions:** ${crossCut.enforcement.response_actions.join(", ")}`);
    lines.push(`- **Review required:** ${crossCut.enforcement.review_required ? "Yes" : "No"}`);
    lines.push(`- **Auto-block:** ${crossCut.enforcement.auto_block ? "Yes" : "No"}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate JSON taxonomy export.
 */
export function generateJsonTaxonomy(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { version: "1.0", severity_model: SEVERITY, categories: [] };
  }

  const categories = entries.map((entry) => {
    const crossCut = generateCrossCutting(entry);
    return crossCut || entry;
  });

  return {
    version: "1.0",
    generated: new Date().toISOString(),
    severity_model: SEVERITY,
    total_categories: categories.length,
    categories,
  };
}

// ─── Step 6: Save to File ────────────────────────────────────────────────────

/**
 * Save policy output to file.
 */
export function savePolicy(filePath, content) {
  try {
    atomicWrite(filePath, content);
    return { success: true, path: filePath, bytes: Buffer.byteLength(content, "utf-8") };
  } catch (err) {
    return { success: false, path: filePath, error: err.message };
  }
}

// ─── Full Pipeline ───────────────────────────────────────────────────────────

/**
 * Run the full 6-step policy generation pipeline.
 */
export function generatePolicy(content, options = {}) {
  const { categories = [], title = "Content Safety Policy" } = options;

  // Step 1: Classify
  const classification = classifyContent(content);

  // Step 2: Map to taxonomy
  const mapped = mapToTaxonomy(content, categories);

  // Step 3-4: Expand and add cross-cutting
  const enriched = mapped.map((entry) => generateCrossCutting(entry)).filter(Boolean);

  // Step 5: Generate outputs
  const markdown = enriched.length > 0
    ? generateMarkdownPolicy(enriched, title)
    : `# ${title}\n\nNo matching taxonomy categories found for the provided content.\n`;

  const json = generateJsonTaxonomy(enriched);

  return {
    classification,
    taxonomy_count: enriched.length,
    categories: enriched.map((e) => e.name),
    markdown,
    json_taxonomy: json,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a policy document against taxonomy.
 */
export function validatePolicy(policy) {
  if (!policy || typeof policy !== "string") {
    return { valid: false, errors: ["Policy must be a non-empty string"] };
  }

  const errors = [];

  // Check it's valid markdown
  if (!policy.startsWith("#")) {
    errors.push("Policy must start with a Markdown heading");
  }

  // Check for required sections
  if (!policy.includes("## Summary")) {
    errors.push("Missing required '## Summary' section");
  }

  // Check severity mentions
  const severityMentions = policy.match(/S[0-4]/g) || [];
  if (severityMentions.length === 0) {
    errors.push("Policy must reference at least one severity level (S0-S4)");
  }

  // Check category format
  const categoryPattern = /## [A-Z][a-zA-Z &]+\(`[a-z_]+`\)/;
  if (!categoryPattern.test(policy)) {
    errors.push("Categories must follow format: ## Display Name (`snake_case_name`)");
  }

  return {
    valid: errors.length === 0,
    errors,
    severity_levels_found: [...new Set(severityMentions)],
  };
}

// ─── Tool Registration ───────────────────────────────────────────────────────

/**
 * Register the policy generator tools on the MCP server.
 */
export function registerPolicyGeneratorTools(server) {
  server.tool(
    "generate_policy",
    "Generates structured content-safety policies with taxonomy classification",
    {
      content: z.string().describe("Content to analyze and generate policy for"),
      categories: z
        .array(z.string())
        .optional()
        .describe("Custom categories to include beyond the standard taxonomy"),
    },
    async ({ content, categories }) => {
      const result = generatePolicy(content, { categories });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "classify_content",
    "Classifies content against the content-safety taxonomy categories",
    {
      content: z.string().describe("Content to classify"),
    },
    async ({ content }) => {
      const result = classifyContent(content);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "validate_policy",
    "Validates a policy document against taxonomy structure requirements",
    {
      policy: z.string().describe("Markdown policy document to validate"),
    },
    async ({ policy }) => {
      const result = validatePolicy(policy);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { TAXONOMY, SEVERITY, VALID_SEVERITIES, getResponseActions };
