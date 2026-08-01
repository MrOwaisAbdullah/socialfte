# How to Run Database Migration with PowerShell

## Step 1: Set Your Database URL

First, load your environment variables from the worker `.env` file:

```powershell
# Navigate to worker directory
cd "D:\GIAIC\Real World Projects\SocialFTE\apps\worker"

# Load environment variables from .env file
Get-Content .env | ForEach-Object {
    if ($_ -match '^(.+?)=(.+)$') {
        [Environment]::SetVariable($matches[1], $matches[2])
    }
}

# Verify DATABASE_URL is set
echo $env:DATABASE_URL
```

## Step 2: Run the Migration

```powershell
# Get the migration script content
$script = Get-Content "db/schema_concepts.sql" -Raw

# Use psql if available in PATH
& psql -d $env:DATABASE_URL -f "db/schema_concepts.sql"
```

## Alternative: Use Python to Run Migration

If you don't have psql installed, use Python:

```powershell
cd "D:\GIAIC\Real World Projects\SocialFTE\apps\worker"

# Run Python migration script
python -c "
import os
from sqlalchemy import create_engine, text

# Read the schema
with open('db/schema_concepts.sql', 'r') as f:
    schema = f.read()

# Create connection
db_url = os.environ.get('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    exit(1)

engine = create_engine(db_url)

# Split by semicolons and execute each statement
with engine.connect() as conn:
    statements = [s.strip() for s in schema.split(';') if s.strip()]
    for statement in statements:
        try:
            conn.execute(text(statement))
            conn.commit()
            print(f'✓ Executed: {statement[:50]}...')
        except Exception as e:
            print(f'✗ Error: {e}')

print('Migration complete!')
"
```

## Step 3: Verify Migration

```powershell
# Run Python verification
python -c "
import os
from sqlalchemy import create_engine, text, inspect

db_url = os.environ.get('DATABASE_URL')
engine = create_engine(db_url)

with engine.connect() as conn:
    # Check if tables exist
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    if 'concepts' in tables:
        print('✓ concepts table created')
    else:
        print('✗ concepts table NOT found')
    
    if 'content_library' in tables:
        print('✓ content_library table created')
    else:
        print('✗ content_library table NOT FOUND')
    
    if 'concept_performance' in tables:
        print('✓ concept_performance table created')
    else:
        print('✗ concept_performance table NOT FOUND')
    
    # Check sample data
    result = conn.execute(text('SELECT COUNT(*) FROM content_library'))
    count = result.scalar()
    print(f'✓ content_library has {count} sample entries')
"
```

## Quick One-Liner (Complete Migration)

```powershell
cd "D:\GIAIC\Real World Projects\SocialFTE\apps\worker"; Get-Content .env | ForEach-Object { if ($_ -match '^(.+?)=(.+)$') { [Environment]::SetVariable($matches[1], $matches[2]) } }; python -c "import os; from sqlalchemy import create_engine, text; schema = open('db/schema_concepts.sql').read(); engine = create_engine(os.environ['DATABASE_URL']); exec([compile(stmt, 'sql', 'exec') for stmt in [s.strip() for s in schema.split(';') if s.strip()]]); print('Migration complete!')"
```

## Troubleshooting

**If DATABASE_URL is not set:**
```powershell
# Check if .env file exists
Test-Path "D:\GIAIC\Real World Projects\SocialFTE\apps\worker\.env"

# View .env file contents (without password)
Get-Content "D:\GIAIC\Real World Projects\SocialFTE\apps\worker\.env" | Select-String -Pattern "DATABASE_URL"
```

**If you get connection errors:**
```powershell
# Test database connection
python -c "
import os
from sqlalchemy import create_engine
engine = create_engine(os.environ['DATABASE_URL'])
try:
    with engine.connect() as conn:
        print('✓ Database connection successful')
except Exception as e:
    print(f'✗ Connection failed: {e}')
"
```

## What to Expect

After successful migration, you should see:
- ✓ concepts table created
- ✓ content_library table created  
- ✓ concept_performance table created
- ✓ content_library has 9 sample entries

Then you can run the concepts job:
```powershell
python -m jobs.create_concepts
```