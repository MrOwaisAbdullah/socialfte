# Advanced Agent Patterns in ChatKit

This guide demonstrates how to use the OpenAI Agents SDK's advanced features within your ChatKit `respond` method.

## 1. Structured Output

You can enforce that an agent returns a specific Pydantic model.

```python
from pydantic import BaseModel, Field
from agents import Agent

class SearchResult(BaseModel):
    summary: str = Field(description="A brief summary of the findings")
    sources: list[str] = Field(description="List of source URLs or titles")

agent = Agent(
    name="Researcher",
    model=model,
    output_type=SearchResult,
    instructions="Research the topic and provide a summary with sources."
)
```

## 2. Using Tools

Register tools that the agent can call.

```python
from agents import function_tool

@function_tool
async def search_qdrant(query: str) -> str:
    """Search the internal knowledge base for relevant info."""
    # Logic to call qdrant_client.search
    return "Relevant context found..."

agent = Agent(
    name="Assistant",
    model=model,
    tools=[search_qdrant],
    instructions="Use search_qdrant to find info before answering."
)
```

## 3. Handling Handoffs

Transition between specialized agents.

```python
from agents import handoff

billing_agent = Agent(name="Billing", instructions="Handle billing queries.", model=model)
tech_agent = Agent(name="Tech Support", instructions="Handle technical issues.", model=model)

triage_agent = Agent(
    name="Triage",
    model=model,
    handoffs=[
        handoff(billing_agent, "billing"),
        handoff(tech_agent, "tech")
    ],
    instructions="Direct the user to billing or tech support based on their query."
)
```

## Integrating with `respond`

In your `respond` method, you simply run the coordinator or specialist agent:

```python
async def respond(self, message_id: str):
    # ...
    result = await Runner.run(triage_agent, user_query)
    
    async def stream():
        yield from stream_text(result.final_output)
    
    return StreamingResponse(stream(), media_type="application/x-ndjson")
```
