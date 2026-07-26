#!/usr/bin/env python3
"""Social Media Post Validator.

Validates posts against banned words, tone guidelines, and quality checks.
Based on the social-media-writer skill writing system.
Updated with top creator research findings (v2.0).

Research sources:
- Justin Welsh: 5-step formula, 162M+ impressions
- Aisha Riaz: Problem → Process → Outcome → Lesson structure
- LinkedIn Marketing: 700-1000 chars optimal
- AuthoredUp Stats: Sentences <12 words perform 20% better
"""

import re
import sys
from typing import Tuple, List


# ============================================================================
# BANNED PHRASES - Complete List
# ============================================================================

BANNED_PHRASES = [
    # Marketing Hype
    "game-changing", "game changing", "revolutionary", "revolutionary-new",
    "groundbreaking", "ground-breaking", "paradigm shift", "paradigm-shift",
    "quantum leap", "quantum-leap", "cutting-edge", "cutting edge",
    "state-of-the-art", "state of the art", "next-gen", "next gen",
    "industry-leading", "industry leading", "breakthrough", "break-through",

    # Excitement Words
    "incredible", "amazing", "awesome", "unbelievable",
    "mind-blowing", "mind blowing", "mindblowing", "jaw-dropping", "jaw dropping",
    "eye-opening", "eye opening", "stunning",

    # Engagement Bait
    "you won't believe", "you wont believe", "this will blow your mind",
    "stop scrolling", "most people don't know", "nobody tells you",
    "the secret to", "hidden gem", "life hack", "life-hack",
    "game changer", "gamechanger",

    # False Urgency
    "before it's too late", "before its too late", "don't miss out",
    "last chance", "limited time only", "act now",

    # Tech Bro Clichés
    "crushing it", "crushingit", "killing it", "killingit", "smashed it",
    "grind never stops", "grindneverstops", "hustle hard", "hustlehard",
    "rise and grind", "riseandgrind", "24/7", "no days off",
    "sleep is for the weak", "thought leader", "thoughtleader",
    "visionary", "ninja", "rockstar developer", "rockstar-developer",
    "guru", "maven", "influencer", "disruptor", "disruptor",

    # Performative Humility
    "i don't mean to brag", "i dont mean to brag", "humbled to announce",
    "blessed to be part", "just a guy who", "not to toot my own horn",
    "i'm no expert but", "im no expert but", "just my two cents",
    "take it with a grain of salt", "to be honest", "to be fair",

    # Empty Filler Phrases
    "at the end of the day", "at the end of day", "it is important to note",
    "needless to say", "the fact of the matter is",
    "in this day and age", "in todays world", "when all is said and done",
    "for all intents and purposes", "as a matter of fact",
    "so to speak", "if you will",

    # Corporate Speak
    "synergy", "leverage", "circle back", "touch base",
    "deep dive", "deep-dive", "bandwidth", "low-hanging fruit",
    "low hanging fruit", "move the needle", "movetheneedle",
    "take offline", "reach out",

    # Inspirational Platitudes
    "follow your dreams", "chase your passion", "believe in yourself",
    "never give up", "dreams don't work unless you do",
    "the only limit is you", "anything is possible",
    "just do it", "make it happen",
]


# ============================================================================
# VALIDATION FUNCTIONS (Updated v2.0)
# ============================================================================

def validate_hook(content: str) -> Tuple[bool, List[str]]:
    """Check for strong hook in first line.

    Research shows first 1-3 lines determine if people click "See More".

    Args:
        content: The post content to check

    Returns:
        (has_hook, list_of_issues)
    """
    issues = []
    lines = content.strip().split('\n')

    if not lines:
        issues.append("No content found")
        return False, issues

    first_line = lines[0].strip()

    # Check if first line is too long (max 12 words for hook)
    hook_word_count = len(first_line.split())
    if hook_word_count > 12:
        issues.append(f"First line too long ({hook_word_count} words, max 12 for hook)")

    # Check for weak hook patterns
    weak_hooks = [
        "so today",
        "hey everyone",
        "hope you're",
        "i wanted to share",
        "i've been working",
    ]
    first_line_lower = first_line.lower()
    for weak in weak_hooks:
        if weak in first_line_lower:
            issues.append(f"Weak hook pattern: '{weak}' (get to the point)")

    # Check if hook creates curiosity or states value
    # Good hooks often: start with verb, state number, ask question, make bold claim
    if len(first_line) < 10:
        issues.append(f"First line too short ({len(first_line)} chars), add more value")

    return len(issues) == 0, issues


def validate_banned_words(content: str) -> Tuple[bool, List[str]]:
    """Check for banned phrases.

    Args:
        content: The post content to check

    Returns:
        (is_clean, list_of_violations)
    """
    content_lower = content.lower()
    violations = []

    for phrase in BANNED_PHRASES:
        if phrase in content_lower:
            violations.append(phrase)

    return len(violations) == 0, violations


def validate_sentence_length(content: str) -> Tuple[bool, List[str]]:
    """Check for overly long sentences.

    Research: Sentences under 12 words perform 20% better.
    Auto-reject if over 15 words.

    Args:
        content: The post content to check

    Returns:
        (is_valid, list_of_issues)
    """
    issues = []
    sentences = re.split(r'[.!?]+', content)

    for i, sentence in enumerate(sentences, 1):
        sentence = sentence.strip()
        if not sentence:
            continue
        word_count = len(sentence.split())

        # Strict: Auto-reject over 15 words
        if word_count > 15:
            issues.append(f"Sentence {i}: {word_count} words (max 15, under 12 performs better)")

        # Warning: Over 10 words
        elif word_count > 10:
            issues.append(f"Sentence {i}: {word_count} words (under 10 is optimal)")

    return len(issues) == 0, issues


def validate_punctuation(content: str) -> Tuple[bool, List[str]]:
    """Check for excessive punctuation.

    Args:
        content: The post content to check

    Returns:
        (is_valid, list_of_issues)
    """
    issues = []

    # Exclamation points (max 2 total)
    exclam_count = content.count('!')
    if exclam_count > 2:
        issues.append(f"Too many exclamation points ({exclam_count}, max 2)")

    # Question marks (usually max 2)
    question_count = content.count('?')
    if question_count > 3:
        issues.append(f"Too many question marks ({question_count}, max 3)")

    return len(issues) == 0, issues


def validate_emojis(content: str, platform: str) -> Tuple[bool, List[str]]:
    """Check emoji count.

    Updated v2.0: Max 2 for LinkedIn, 1 for Twitter.

    Args:
        content: The post content to check
        platform: One of "linkedin", "twitter", "whatsapp"

    Returns:
        (is_valid, list_of_issues)
    """
    issues = []

    # Approximate emoji detection (common ranges)
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+"
    )
    emoji_count = len(emoji_pattern.findall(content))

    # Updated limits v2.0
    max_emojis = {"linkedin": 2, "twitter": 1, "whatsapp": 2}
    limit = max_emojis.get(platform, 2)

    if emoji_count > limit:
        issues.append(f"Too many emojis ({emoji_count}, max {limit} for {platform})")

    return len(issues) == 0, issues


def validate_hashtags(content: str, platform: str) -> Tuple[bool, List[str]]:
    """Check hashtag count.

    Args:
        content: The post content to check
        platform: One of "linkedin", "twitter", "whatsapp"

    Returns:
        (is_valid, list_of_issues)
    """
    issues = []

    # Count hashtags (both #word and hashtag#word formats)
    hashtag_count = content.count('#')

    max_hashtags = {"linkedin": 5, "twitter": 3, "whatsapp": 0}
    limit = max_hashtags.get(platform, 5)

    if hashtag_count > limit:
        issues.append(f"Too many hashtags ({hashtag_count}, max {limit} for {platform})")

    return len(issues) == 0, issues


def validate_length(content: str, platform: str) -> Tuple[bool, List[str]]:
    """Check character count.

    Updated v2.0: Optimal 700-1000 for LinkedIn (not just max 1300).

    Args:
        content: The post content to check
        platform: One of "linkedin", "twitter", "whatsapp"

    Returns:
        (is_valid, list_of_issues)
    """
    issues = []
    char_count = len(content)

    # Hard limits
    hard_limits = {"linkedin": 1300, "twitter": 280, "whatsapp": 700}
    # Optimal ranges
    optimal_ranges = {
        "linkedin": (700, 1000),
        "twitter": (200, 270),
        "whatsapp": (50, 150)
    }

    hard_limit = hard_limits.get(platform, 1300)

    if char_count > hard_limit:
        issues.append(f"Too long ({char_count} chars, max {hard_limit} for {platform})")

    # Check optimal range
    optimal_min, optimal_max = optimal_ranges.get(platform, (700, 1000))

    if char_count < optimal_min:
        issues.append(f"Below optimal length ({char_count} chars, optimal {optimal_min}-{optimal_max} for {platform})")
    elif char_count > optimal_max:
        issues.append(f"Above optimal length ({char_count} chars, optimal {optimal_min}-{optimal_max} for {platform})")

    return len(issues) == 0, issues


def validate_scannability(content: str) -> Tuple[bool, List[str]]:
    """Check for scannability (critical for mobile readers).

    Updated v2.0: Max 3 lines per paragraph, wall of text detection.

    Args:
        content: The post content to check

    Returns:
        (is_valid, list_of_issues)
    """
    issues = []
    lines = content.split('\n')
    paragraph_line_count = 0

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Count lines in current paragraph
        if stripped:
            paragraph_line_count += 1
        else:
            paragraph_line_count = 0

        # Check: Max 3 lines per paragraph
        if paragraph_line_count > 3:
            issues.append(f"Line {i}: Paragraph too long ({paragraph_line_count} lines, max 3)")

        # Check: Wall of text (long line with few spaces)
        if len(stripped) > 80:
            space_count = stripped.count(' ')
            if space_count < len(stripped) / 15:  # Less than ~1 space per 15 chars
                issues.append(f"Line {i}: Wall of text detected ({len(stripped)} chars, add breaks)")

    return len(issues) == 0, issues


def validate_cta(content: str) -> Tuple[bool, List[str]]:
    """Check for Call-to-Action at end.

    Research shows posts with CTAs get more engagement.

    Args:
        content: The post content to check

    Returns:
        (has_cta, list_of_issues)
    """
    issues = []
    lines = content.strip().split('\n')

    if not lines:
        issues.append("No content found")
        return False, issues

    # Check last 3 lines for CTA patterns
    last_lines = lines[-3:] if len(lines) >= 3 else lines

    has_cta = False
    for line in last_lines:
        line_lower = line.lower().strip()

        # CTA patterns: questions, prompts, invitations
        cta_patterns = [
            "?",  # Question
            "what do you think",
            "what's your",
            "thoughts",
            "would love to",
            "let me know",
            "share your",
            "comment below",
            "👇",  # Down arrow (common CTA indicator)
        ]

        for pattern in cta_patterns:
            if pattern in line_lower:
                has_cta = True
                break

    if not has_cta:
        issues.append("No clear CTA at end (add question or prompt to encourage engagement)")

    return has_cta, issues


def validate_simple_english(content: str) -> Tuple[bool, List[str]]:
    """Check for simple English (non-native friendly).

    Args:
        content: The post content to check

    Returns:
        (is_simple, list_of_complex_words)
    """
    concerns = []

    # Complex words to avoid (use simpler alternatives)
    complex_words = {
        "utilize": "use",
        "leverage": "use",
        "facilitate": "help",
        "implement": "add",
        "consequently": "so",
        "nevertheless": "still",
        "furthermore": "also",
        "demonstrate": "show",
        "approximately": "about",
        "subsequently": "later",
    }

    words = content.split()
    for word in words:
        # Strip punctuation
        clean_word = word.lower().strip('.,!?;:"')
        if clean_word in complex_words:
            concerns.append(f"Complex word: '{clean_word}' (use '{complex_words[clean_word]}' instead)")

    return len(concerns) == 0, concerns


def validate_tone(content: str) -> Tuple[bool, List[str]]:
    """Validate tone authenticity.

    Args:
        content: The post content to check

    Returns:
        (is_authentic, list_of_concerns)
    """
    concerns = []
    content_lower = content.lower()

    # Check for excessive hype words
    hype_words = ["incredible", "amazing", "unbelievable", "mind-blowing"]
    for word in hype_words:
        if word in content_lower:
            # Check if followed by specific details
            has_specifics = (
                bool(re.search(r"\d+", content)) or  # numbers
                bool(re.search(r"[A-Z][a-z]+ [A-Z][a-z]+", content)) or  # names
                bool(re.search(r"(Python|React|API|AI|ML|FastAPI)", content))  # tech
            )
            if not has_specifics:
                concerns.append(f"'{word}' without specific context")

    # Check for ALL CAPS (except acronyms)
    words = content.split()
    for word in words:
        if word.isupper() and len(word) > 3 and word not in ["AI", "ML", "API", "LLM", "CLI", "CTA"]:
            concerns.append(f"ALL CAPS word: '{word}'")

    # Check for specific details (good sign)
    has_numbers = bool(re.search(r"\d+", content))
    has_names = bool(re.search(r"[A-Z][a-z]+ [A-Z][a-z]+", content))
    has_tech = bool(re.search(r"(Python|React|FastAPI|API|database)", content))

    if not (has_numbers or has_names or has_tech):
        concerns.append("Post lacks specific details (numbers, names, tech)")

    return len(concerns) == 0, concerns


# ============================================================================
# MAIN VALIDATION FUNCTION (Updated v2.0)
# ============================================================================

def validate_post(content: str, platform: str = "linkedin") -> Tuple[bool, List[str], List[str]]:
    """Run all validation checks on a post.

    Args:
        content: The post content to validate
        platform: One of "linkedin", "twitter", "whatsapp"

    Returns:
        (is_valid, errors, warnings)

        errors: Issues that must be fixed (auto-reject)
        warnings: Concerns that don't block posting but should be reviewed
    """
    errors = []
    warnings = []

    # Hook validation (v2.0 - critical)
    valid, issues = validate_hook(content)
    if not valid:
        errors.extend(issues)

    # Banned words (auto-reject)
    clean, violations = validate_banned_words(content)
    if not clean:
        for v in violations:
            errors.append(f"Banned phrase: '{v}'")

    # Sentence length (v2.0 - stricter)
    valid, issues = validate_sentence_length(content)
    if not valid:
        errors.extend(issues)

    # Punctuation
    valid, issues = validate_punctuation(content)
    if not valid:
        errors.extend(issues)

    # Emojis (v2.0 - stricter limits)
    valid, issues = validate_emojis(content, platform)
    if not valid:
        errors.extend(issues)

    # Hashtags
    valid, issues = validate_hashtags(content, platform)
    if not valid:
        errors.extend(issues)

    # Length (v2.0 - optimal range checks)
    valid, issues = validate_length(content, platform)
    if not valid:
        # Separate errors from optimal range warnings
        for issue in issues:
            if "Too long" in issue or "Above optimal" in issue:
                if "Above optimal" in issue:
                    warnings.append(issue)  # Warning, not error
                else:
                    errors.append(issue)
            else:
                errors.append(issue)

    # Scannability (v2.0 - new)
    valid, issues = validate_scannability(content)
    if not valid:
        errors.extend(issues)

    # CTA validation (v2.0 - new)
    valid, issues = validate_cta(content)
    if not valid:
        errors.extend(issues)

    # Simple English (v2.0 - new, warnings only)
    valid, concerns = validate_simple_english(content)
    if not valid:
        warnings.extend(concerns)

    # Tone check produces warnings, not errors
    authentic, concerns = validate_tone(content)
    if not authentic:
        warnings.extend(concerns)

    return len(errors) == 0, errors, warnings


# ============================================================================
# COMMAND LINE INTERFACE
# ============================================================================

def main():
    """CLI interface for validation."""
    if len(sys.argv) < 2:
        print("Usage: python validator.py 'your post content' [platform]")
        print("Platforms: linkedin (default), twitter, whatsapp")
        print()
        print("Example:")
        print('  python validator.py "I just shipped my first CLI app." linkedin')
        sys.exit(1)

    content = sys.argv[1]
    platform = sys.argv[2] if len(sys.argv) > 2 else "linkedin"

    is_valid, errors, warnings = validate_post(content, platform)

    print(f"\n{'='*60}")
    print(f"Validation Results for {platform.upper()}")
    print(f"{'='*60}\n")

    if is_valid and not warnings:
        print("✅ Post passes all checks!")
        sys.exit(0)

    if errors:
        print("❌ ERRORS (must fix):\n")
        for error in errors:
            print(f"  • {error}")
        print()

    if warnings:
        print("⚠️  WARNINGS (review recommended):\n")
        for warning in warnings:
            print(f"  • {warning}")
        print()

    if not is_valid:
        print(f"❌ Post validation FAILED ({len(errors)} error(s))\n")
        sys.exit(1)
    else:
        print(f"⚠️  Post passes but has {len(warnings)} warning(s)\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
