# Implementation Summary: RFC 2119 + Structural Tags for AI Rules

## Completed Tasks

### 1. Created `src/prompt-conventions.js`
A utility module that defines:

- **RFC 2119 Keyword Shortcuts:**
  - `NEVER` = `MUST NOT`
  - `AVOID` = `SHOULD NOT`
  - `MUST` = `MUST`
  - `SHOULD` = `SHOULD`
  - `MAY` = `MAY`

- **Structural Tags:**
  - `<critical>` - Absolute invariants and prohibitions
  - `<workflow>` - Step-by-step operational procedures
  - `<completeness>` - Acceptance criteria and definition of done
  - `<yielding>` - Output format and delivery requirements
  - `<anti-patterns>` - Forbidden approaches and consequences
  - `<decision>` - Decision trees and conditional logic

- **Tag Placement Rules:**
  - Critical tags MUST appear at START AND END of prompts
  - Validates balanced tag usage

- **Density Rules:**
  - Maximum 12 words per bullet point
  - Minimum 3 meaningful words per bullet
  - Detects and blocks filler phrases

### 2. Updated 5 AI Rules

#### 01-ai-workflow-strict.md
- Replaced "Never" → **NEVER**
- Replaced "Avoid" → **AVOID**
- Added RFC 2119 keywords throughout

#### 03-token-economy.md
- Added `<workflow>` tags to context lifecycle section
- Replaced "must not" → **MUST NOT**
- Replaced "Never" → **NEVER**
- Replaced "Avoid" → **AVOID**

#### 05-debugging-mastery.md
- Added `<anti-patterns>` tags around prohibited logging patterns
- Replaced "Never" → **NEVER** (3 instances)
- Replaced "shouldn't" → **NEVER**
- Added RFC 2119 keywords to debugging guidelines

#### 06-ci-cd-testing.md
- Added `<completeness>` tags to pipeline requirements
- Replaced "Avoid" → **AVOID**
- Replaced "Never" → **NEVER**
- Added RFC 2119 keywords to CI/CD guidelines

#### 07-frontend-semantic.md
- Added `<workflow>` tags to HTML semantics section
- Replaced "NUNCA" → **NEVER** (3 instances)
- Replaced "Evite" → **AVOID**
- Added RFC 2119 keywords to frontend guidelines

### 3. Created `test/prompt-conventions.test.js`
Comprehensive test suite with 34 tests covering:

- RFC 2119 keyword mapping correctness
- Structural tag definitions and validation
- Critical placement rules enforcement
- Density rule validation (max/min words, filler detection)
- RFC 2119 compliance checking
- Structural tag validation (ornamental detection, balance checking)
- Full prompt analysis integration

**All 34 tests pass successfully.**

## Technical Details

### Module Exports
- `RFC_SHORTCUTS` - Keyword mappings
- `RFC_MEANINGS` - Semantic descriptions
- `STRUCTURAL_TAGS` - Valid tags with purposes
- `ORNAMENTAL_TAGS` - Forbidden decorative tags
- `DENSITY_MAX_WORDS` - Maximum words per bullet (12)
- `DENSITY_MIN_CONTENT` - Minimum meaningful words (3)
- `checkCriticalPlacement()` - Validates critical tag balance
- `validateDensity()` - Checks bullet length and filler
- `validateRFC2119Compliance()` - Detects informal language
- `validateStructuralTags()` - Validates tag usage
- `analyzePromptConventions()` - Full analysis combining all checks

### Test Coverage
- 34 tests across 8 test suites
- 100% pass rate
- Tests cover: keyword mapping, tag definitions, placement rules, density validation, compliance checking, and full analysis

## Verification
```bash
node --test test/prompt-conventions.test.js
# All 34 tests pass
```

## Usage
```javascript
import { 
  analyzePromptConventions,
  validateRFC2119Compliance,
  checkCriticalPlacement 
} from './src/prompt-conventions.js';

// Full analysis
const result = analyzePromptConventions(promptText);
console.log(result.passed); // true if fully compliant

// Individual checks
const rfc = validateRFC2119Compliance(text);
const placement = checkCriticalPlacement(text);
```

## Files Modified
- `src/prompt-conventions.js` (NEW)
- `test/prompt-conventions.test.js` (NEW)
- `ai-rules/01-ai-workflow-strict.md`
- `ai-rules/03-token-economy.md`
- `ai-rules/05-debugging-mastery.md`
- `ai-rules/06-ci-cd-testing.md`
- `ai-rules/07-frontend-semantic.md`
