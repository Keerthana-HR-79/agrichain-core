# Part B2 — AI chatbot (RAG) + the agentic negotiator

> **Group B — NOT on your résumé. 🟡 SET ASIDE.** Study after Group A. **Covers:** what the chatbot is · RAG from basics · the **honest truth** that this is **keyword retrieval, not vector embeddings** · the 10-doc knowledge base · the chat pipeline · the **agentic negotiator** (LLM tool-calling loop) · the crop-health advisor with a rule-based fallback · honest limits · Q&A.
> **Why Group B:** it's an **optional AI add-on** powered by an external LLM (Groq), not one of the three résumé bullets. Know the **gist** so you can say *"yes, it also has an AI assistant and an auto-negotiator"* — and explain them honestly — **without over-claiming**.

**Framing line if asked:** *"The core platform is the full-stack marketplace and escrow. On top of that I added an optional AI layer — a RAG chatbot and an agentic price-negotiator — using Groq's LLM API. I kept it off my résumé to stay focused, but I can walk you through it."*

---

## B2.0 The 30-second summary (say this, then stop)

> *"There are two AI features. First, **AgriBot** — a chatbot that answers questions about the platform and Indian farming. It uses **RAG**: before calling the LLM I retrieve the most relevant policy documents and feed them in as context, so answers are grounded in my actual rules, not made up. Honestly, the retrieval is **keyword-based, not vector embeddings** — a deliberate simplification. Second, an **agentic negotiator**: when a buyer makes an offer, the farmer can let an AI agent negotiate — it **calls tools** to look up the live market price and predicted yield, then decides whether to accept or counter. Both run on **Groq's** LLM API and both **degrade gracefully** if the key or service is missing."*

That paragraph is honest, technical, and complete. Everything below is so you can defend each sentence.

---

## B2.1 🔵 LEARN DEEP — what is an LLM API, and what is Groq?

- **LLM** = Large Language Model (like the model answering you now) — software that generates text given a prompt.
- Instead of hosting a huge model myself (needs expensive GPUs), I call a **hosted LLM over HTTP** — send a prompt, get back generated text. That's an **LLM API**.
- **Groq** is one such provider. The key detail: **Groq's API is "OpenAI-compatible"** — same request/response *shape* as OpenAI's `chat/completions`. The code POSTs to `https://api.groq.com/openai/v1/chat/completions`.
- **Model used (firsthand):** `openai/gpt-oss-20b` by default (an open-weights 20-billion-parameter model served by Groq), overridable via a `GROQ_MODEL` env var. It's on Groq's **free tier**, which is why it was chosen.
- **The key is a secret:** `GROQ_API_KEY` is a runtime env var (Part 9.3). If it's missing, the chat endpoint returns **503** with a helpful message instead of crashing.

> **Say it:** *"I don't host a model — I call Groq's hosted LLM over HTTP. Their API mirrors OpenAI's shape, so the same request format works. I use a free open-weights 20B model, and the API key lives in an environment variable, never in code."*

---

## B2.2 🔵 LEARN DEEP — what is RAG? (from basics)

**RAG = Retrieval-Augmented Generation.** The problem it solves: an LLM only knows what it was trained on — it **doesn't know *your* app's specific rules** (your escrow policy, your GPS tolerance, your crop-stage names). If you just ask it, it will **guess** — and guessing about your own policies is **hallucination**.

**RAG fixes this in two steps:**
1. **Retrieve** — before calling the LLM, search *your own documents* for the pieces most relevant to the question.
2. **Augment + Generate** — paste those pieces into the prompt as "context," and tell the LLM: *"answer using this context."*

So the LLM answers from **your** facts, not its vague memory. It's like giving someone an open-book exam with the right page already bookmarked.

> **Say it:** *"RAG means I retrieve my own relevant documents first and feed them to the LLM as context, so it answers from my actual policies instead of hallucinating. It's the difference between a closed-book and an open-book exam."*

---

## B2.3 ⚠️ THE HONEST HEADLINE — keyword retrieval, **not** vector embeddings

This is the single most important thing to say correctly, because an interviewer *will* ask "how does the retrieval work?" — and the mature answer is the honest one.

**The textbook "proper" RAG** uses **vector embeddings**: you convert every document and the question into numeric vectors that capture *meaning*, then find documents whose vectors are *closest* (semantic similarity). That needs an embedding model and usually a vector database (e.g. **pgvector**, Pinecone).

**What AgriChain actually does (firsthand):** **keyword overlap scoring**. For each document it counts how many words (longer than 3 letters) from the question also appear in the document, sorts by that count, and takes the **top 3** with a non-zero score:

```js
function retrieveContext(question){
  const q = question.toLowerCase();
  const scored = KNOWLEDGE_BASE.map((doc) => {
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    const content = (doc.title + " " + doc.content).toLowerCase();
    const score = words.reduce((s, w) => s + (content.includes(w) ? 1 : 0), 0);
    return { ...doc, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 3).filter((d) => d.score > 0);
}
```

**The code is openly honest about this trade-off** — its own comment says: *"In production you'd use pgvector + embeddings; here we do keyword-based retrieval (works without a GPU/embedding model, still far better than a plain system prompt because it retrieves exact policy text)."*

**🔵 Why this is a GOOD answer, not a weak one:**
- It's a **deliberate, justified** simplification: no embedding model, no GPU, no vector DB to run — yet it still grounds answers in real policy text, which is **much** better than no retrieval at all.
- You know **exactly** what the "proper" version is and can describe the upgrade path. That's what senior engineers do — ship the pragmatic version, name the ideal one.
- **The weakness** (say it): keyword matching misses **synonyms** — ask about "payment" when the doc says "escrow release" and the overlap is low. Embeddings would catch that because they match *meaning*.

> **Say it (interview gold):** *"Honestly it's keyword-overlap retrieval, not embeddings — I score each doc by how many query words it contains and take the top three. The proper version is pgvector with embeddings for semantic match, and I know that's the upgrade. I chose keywords because it needs no GPU or vector DB and still grounds the LLM in real policy text. The limitation is synonyms — it matches words, not meaning."*

**Never claim you used embeddings or a vector database — you didn't, and the code proves it. The honest story is stronger than a false one.**

---

## B2.4 The knowledge base (10 documents)

`KNOWLEDGE_BASE` is a hard-coded array of **10 documents**, each `{ title, content }`, covering:

1. GPS Verification Policy  2. Contract & Escrow Policy  3. AI Yield Prediction  4. Crop Growth Stages  5. Farming Seasons  6. Soil Types  7. Irrigation Methods  8. Platform FAQs  9. Market Price Settlement  10. Crop Health / Disease.

- On startup, `seedKnowledgeBase()` inserts these into a **`rag_documents`** Postgres table **if it's empty** (so the KB is persisted, not just in memory).
- Retrieval (B2.3) runs over this set; the titles of the docs that were used are returned to the UI as **`sources`**, so the user sees *what the answer was based on* (a nice trust feature).

> **Say it:** *"The knowledge base is ten curated docs — GPS policy, escrow policy, crop stages, seasons, soil, irrigation, FAQs, market settlement, crop health. I seed them into a table at startup and return the titles of the ones I used as 'sources' with each answer."*

---

## B2.5 The chat pipeline, end to end (firsthand)

```
POST /api/rag/chat   (auth required, rate-limited by chatLimiter)
        │   body: { message }
        ▼
1. Require logged-in user (req.user.id) and a non-empty message
2. No GROQ_API_KEY?  → 503 "AI assistant not configured"   (graceful)
3. retrieveContext(message)         → top-3 keyword-matched docs
4. Load last 8 turns from chatbot_messages   → short-term memory
5. Build the "AgriBot" system prompt:
       • includes the retrieved context text
       • "answer primarily from this context"
       • "if context doesn't cover it, use general knowledge of Indian agriculture"
       • "answer in the same language the user writes (English or Kannada)"
       • "never make up policy details"
6. POST to Groq  (system + history + user message, max_tokens 1024)
7. Save BOTH the user message and the assistant reply to chatbot_messages
8. Return { reply, sources: [titles of docs used] }
```

Two more endpoints: **`GET /api/rag/history`** (recent messages) and **`DELETE /api/rag/history`** (clear the conversation).

**🔵 Things worth noticing:**
- **Conversation memory** = the last 8 messages are replayed each call. The LLM itself is stateless; *I* provide the memory by resending recent turns. (Same idea as JWT being stateless — the state rides along with the request.)
- **Bilingual by prompt** — English/Kannada is just an instruction in the system prompt, not a separate translation system.
- **Anti-hallucination** is enforced by *both* RAG context *and* explicit prompt instructions ("never make up policy details").

> **Say it:** *"Each turn I retrieve context, pull the last eight messages for memory, build a system prompt that pins the answer to that context, call Groq, save both sides of the exchange, and return the reply plus the source doc titles. The LLM is stateless, so I supply the conversation memory myself."*

---

## B2.6 🔵 LEARN DEEP — the agentic negotiator (LLM **tool-calling**)

This is the most advanced AI piece and the one most worth understanding, because **"agentic" and "tool-calling" are hot interview words** — and here they're **real**, not buzzwords.

### The problem
A buyer offers a price. Should the farmer accept, or counter? A good decision needs **live data**: the current market price and the predicted yield. A plain chatbot can't fetch those. An **agent** can.

### 🔵 What "tool-calling" (a.k.a. function-calling) means
Modern LLMs can be given a list of **tools** (functions) they're *allowed to call*. Instead of only returning text, the model can return *"please call `get_market_price(crop='rice')`."* **Your code runs the function**, feeds the **result** back to the model, and the model continues — now armed with real data. The model decides *which* tool and *when*; your code does the *actual* work. That loop is what makes it **"agentic"** — the LLM drives a multi-step process toward a goal.

### The 3 tools (firsthand)
Defined in OpenAI/Groq tool format (`{ type:"function", function:{ name, description, parameters } }`):

| Tool | What your code does when the LLM calls it |
|---|---|
| `get_market_price` | Query the `market_prices` table for the crop's live mandi price |
| `get_ai_predicted_yield` | Read the listing's stored predicted yield |
| `suggest_counter_offer` | The agent's **final decision** — accept, or counter at a price (ends the loop) |

### The agentic loop (firsthand)
```
messages = [ system prompt with the negotiation strategy, the buyer's offer ]
repeat up to MAX_ITER = 5 times:
    response = Groq.chat(messages, tools = NEGOTIATION_TOOLS)
    if the model asked to call tool(s):
        for each tool_call:
            args = JSON.parse(tool_call.arguments)   // args arrive as a JSON string
            result = run that tool in my code
            push { role:"tool", tool_call_id, content: result } into messages
        if the tool was suggest_counter_offer → DONE (we have the decision)
    else (model returned plain text, finish_reason != "tool_calls"):
        break
```
Every step is recorded as an **`agentSteps`** trail (`thought` / `tool_call` / `tool_result`) and shown to the user, so the negotiation is **transparent** — you can see *why* the agent decided what it did.

### The strategy (baked into the system prompt, firsthand)
- If the offer is **within 10%** of market → consider **accepting**.
- If it's **more than 10% below** market → **counter at ~95% of market price**.
- A **guaranteed early buyer** is worth a small discount (~5–8%).

### After deciding
The result (and the step trail) is saved to a **`negotiation_log`** table and a **notification** is created. Guardrails: only the **farmer** role can run it (`role("farmer")`), and only on **`pending`** contracts.

> **Say it (interview gold):** *"The negotiator is a real tool-calling agent. I give Groq three tools — get market price, get predicted yield, and suggest-counter-offer — and loop up to five times: the model requests a tool, my code executes it and feeds the result back, until the model calls suggest-counter-offer to finish. The strategy lives in the system prompt — accept within 10% of market, else counter at 95%. I log every thought and tool result so the decision is transparent."*

### ⚠️ Honest note on the agent
It's a **decision-support suggestion**, not an autonomous actor — it proposes a counter-offer; it doesn't move money or sign the contract. And like any LLM, its reasoning can be imperfect, which is exactly why the **tool results are real data** and the **final numbers are clamped by escrow logic** elsewhere.

---

## B2.7 The crop-health advisor (bonus AI feature, firsthand)

- Endpoint: **`GET /api/agent/health/:listing_id/:stage_name`** (auth).
- It gathers the listing, the **climate** for that state/district (from the Python AI service's `/climate/...` endpoint, Part B1), and the latest crop stage, then asks Groq for **3 tips** as a JSON array (`category / severity / tip`).
- **🔵 The important part — a rule-based fallback:** if Groq is unavailable or returns something unparseable, it falls back to **`getDefaultTips()`**, which generates sensible tips from **rules** on rainfall / temperature / stage. So the feature **always returns something useful**, with or without the LLM.
- Tips are saved to `crop_health_tips`; `GET /api/agent/health/:listing_id` returns saved tips.

> **Say it:** *"There's also a crop-health advisor — it asks the LLM for three tips based on the crop's climate and stage, but if the LLM is down it falls back to rule-based tips keyed on rainfall, temperature and stage, so it never just fails."*

---

## B2.8 How this connects to the rest of AgriChain

- The chatbot's KB **describes** the same policies Group A implements (GPS, escrow, settlement) — it's a *window* onto the real system.
- The negotiator **consumes** the live market price (Part 8) and the predicted yield (Part B1) — it sits *on top of* those real features.
- Everything is **optional**: no `GROQ_API_KEY` → the AI endpoints return a clean 503; the marketplace, contracts, and escrow are **completely unaffected**. (Same graceful-degradation philosophy as the ML service.)

---

## B2.9 ⚠️ HONEST LIMITS (volunteer these — they show judgment)

- **Keyword retrieval, not embeddings** → misses synonyms/semantics; the real upgrade is pgvector + an embedding model (B2.3). *This is the headline — say it proactively.*
- **Hand-written KB can drift from the code.** The curated docs are maintained separately from the controllers, so a number in a doc can fall out of sync with the actual logic over time. This is a general risk of RAG-over-curated-docs versus retrieving from the source of truth — worth naming if pushed.
- **LLM hallucination** → mitigated by RAG context + "never make up policy details," but never *eliminated*; an LLM can still be confidently wrong.
- **External dependency / free tier** → Groq free-tier rate limits and latency; the rate-limiter (`chatLimiter`) and graceful 503 handle it, but it's not production-hardened for scale.
- **The negotiator suggests, it doesn't execute** → no money moves from the agent; it's advisory, and that's the safe design.

---

## B2.10 Questions you might get (with answers)

**Q: What is RAG, in one line?**
> *"Retrieve your own relevant documents first, feed them to the LLM as context, so it answers from your facts instead of hallucinating."*

**Q: How does your retrieval actually work — embeddings?**
> *"Honestly, no — it's keyword-overlap scoring over ten curated docs, top three by match count. The proper version is pgvector embeddings for semantic search, which I'd add next. Keywords need no GPU or vector DB and still ground the model in real policy text; the limitation is synonyms."*

**Q: Why not use embeddings from the start?**
> *"Pragmatism — embeddings need an embedding model and a vector store to run and deploy. Keyword retrieval got 80% of the benefit — grounded answers — at near-zero infra cost, and I know the upgrade path."*

**Q: How does the chatbot remember the conversation?**
> *"The LLM is stateless, so I resend the last eight messages each call. The memory lives in my database, not the model."*

**Q: What stops it making up your policies?**
> *"Two things: RAG gives it the real policy text, and the system prompt explicitly says 'never make up policy details, use the context.' It reduces hallucination but can't guarantee zero."*

**Q: What does "agentic" mean in your negotiator?**
> *"The LLM drives a multi-step loop using tools. It asks to call my functions — market price, predicted yield — I run them and feed results back, and it loops until it calls 'suggest counter offer.' The model decides the steps; my code does the actions."*

**Q: What's tool-calling / function-calling?**
> *"Giving the model a list of functions it's allowed to invoke. It returns 'call this function with these args' instead of text; my code executes it and returns the result for the model to continue with."*

**Q: What's the negotiation strategy?**
> *"Accept if the offer's within 10% of market, counter at about 95% of market if it's more than 10% below, and value a guaranteed early buyer at a small discount. It's in the system prompt."*

**Q: Does the agent actually move money or sign contracts?**
> *"No — it's advisory. It suggests a counter-offer and logs its reasoning. Money only moves through the escrow engine, which has its own locks and invariants."*

**Q: Which model and provider?**
> *"Groq's API, which is OpenAI-compatible, running a free open-weights 20B model. The key is an env var; if it's missing the AI endpoints return 503 and the rest of the app is unaffected."*

**Q: Is this on your résumé?**
> *"No — I kept the résumé to the full-stack core. This is an optional AI layer I can discuss if you're interested. I'd rather under-claim and show you the real thing than oversell it."*

---

### ⚠️ HONEST LIMITS recap
- Keyword RAG, not embeddings (know the upgrade: pgvector).
- LLM can hallucinate; curated KB can drift from code.
- Groq free-tier limits; AI is optional and degrades to 503.
- Negotiator is advisory — never moves money.

---

### Next: Part B3 — Offline-first / PWA (IndexedDB write-queue + service worker).
