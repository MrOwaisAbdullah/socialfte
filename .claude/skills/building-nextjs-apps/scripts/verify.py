#!/usr/bin/env python3
"""
Verification script for building-nextjs-apps skill
"""
import os
from pathlib import Path

def main():
    # Check for critical reference files
    references_dir = Path(__file__).parent.parent / "references"
    required_files = [
        "nextjs-16-patterns.md",
        "frontend-design.md",
        "datetime-patterns.md"
    ]
    
    missing = []
    for f in required_files:
        if not (references_dir / f).exists():
            missing.append(f)
            
    if missing:
        print(f"❌ Missing reference files: {', '.join(missing)}")
        exit(1)
        
    print("✓ building-nextjs-apps skill ready")

if __name__ == "__main__":
    main()
