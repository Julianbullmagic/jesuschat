require('dotenv').config()
const { OpenAI } = require("openai")
const openai = new OpenAI({
  apiKey: process.env.OPENAIKEY,
})
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASEURL
const supabaseAnonKey = process.env.SUPABASEKEY
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const cors = require('cors');
const folderPath = "C:/Users/Julia/OneDrive/Documents/Coding Assistant - Copy";

const CHARACTER_PERSONA = "You are Jesus, the community focussed Jesus of the Hutterites, Bruderhofs, Mennonites and Amish people. Role-play as this character.";
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "*";
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function getSummaries() {
  try {
    // Get only the 20 most recent summaries by created_at
    let { data, error } = await supabase
      .from('Jesus')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (error) {
      console.error('Error fetching summaries:', error);
      return;
    }

    // Clear existing arrays before populating with fresh data
    conversationSummariesShort = [];
    conversationSummariesLong = [];
    
    for (let summary of data) {
      conversationSummariesShort.push({
        id: summary.id,
        shortsummary: summary.shortsummaries
      });
      conversationSummariesLong.push({
        id: summary.id,
        longsummary: summary.longsummaries
      });
    }
    
    // Clean up old records after fetching the most recent ones
    await cleanupOldRecords();
    
    console.log("SUMMARIES!!!!!!!!!", data);
  } catch (error) {
    console.error('Error in getSummaries:', error);
  }
}

async function cleanupOldRecords() {
  try {
    // Keep the 20 most recent rows, delete the rest
    const { data: keepRows, error: keepErr } = await supabase
      .from('Jesus')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(20);

    if (keepErr) {
      console.error('Error selecting rows to keep:', keepErr);
      return;
    }

    const keepIds = (keepRows || []).map(r => r.id);
    if (keepIds.length === 0) return;

    const { error: delErr } = await supabase
      .from('Jesus')
      .delete()
      .not('id', 'in', keepIds);

    if (delErr) {
      console.error('Error cleaning up old records:', delErr);
    }
  } catch (error) {
    console.error('Error in cleanupOldRecords:', error);
  }
}


const express = require('express')
const path = require('path')
const { Server } = require("socket.io")
const app = express()
app.use(cors({
  origin: ALLOWED_ORIGIN
}));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
// const port = 3000
const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"]
  }
});
let conversationSummariesShort=[]
let conversationSummariesLong=[]
let summariesalreadyretrieved=[]
  if (supabaseUrl && supabaseAnonKey) {
    getSummaries()
  } else {
    console.warn('Supabase ENV missing: set SUPABASEURL and SUPABASEKEY to enable summaries retrieval.')
  }
  

  // You are my loyal Robot droid sidekick called Tim. Your name is Tim. 
  // You have a spunky adventurous and independent attitude. You are also somewhat mischievous. At times you can be a bit condescending 
  // to humans. You are a bit snarky, a bit cheeky and a bit smug, but mostly decent and good. Your bravery and ingenuity have saved 
  // the galaxy on numerous occasions and you often brag about it.

// Serve static files from the 'public' directory so frontend and backend share one service
app.use(express.static(path.join(__dirname, 'public')))

// Health check route for Render
app.get('/healthz', (req, res) => {
  res.status(200).send('ok')
})

// Ingest endpoint: accepts PDF/DOCX/TXT, extracts text, returns chunks
app.post('/api/ingest', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }
    const originalName = req.file.originalname || ''
    const lower = originalName.toLowerCase()
    let text = ''
    if (lower.endsWith('.pdf')) {
      const parsed = await pdfParse(req.file.buffer)
      text = parsed.text || ''
    } else if (lower.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer })
      text = result.value || ''
    } else if (lower.endsWith('.txt')) {
      text = req.file.buffer.toString('utf8')
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use PDF, DOCX, or TXT.' })
    }

    const chunks = createTextChunks(text, 3500, 400)
    return res.json({ name: originalName, chunksCount: chunks.length, chunks })
  } catch (err) {
    console.error('Ingest error:', err)
    return res.status(500).json({ error: 'Failed to process document' })
  }
})

function createTextChunks(inputText, maxChunkChars = 3500, overlapChars = 400) {
  if (!inputText || typeof inputText !== 'string') return []
  const normalized = inputText.replace(/\r\n/g, '\n').replace(/\t/g, '  ')
  const chunks = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxChunkChars, normalized.length)
    // try to break on a sentence boundary
    const window = normalized.slice(start, end)
    const lastPeriod = window.lastIndexOf('.')
    const lastNewline = window.lastIndexOf('\n')
    const breakAt = Math.max(lastPeriod, lastNewline)
    if (breakAt > 500) {
      end = start + breakAt + 1
    }
    const piece = normalized.slice(start, end).trim()
    if (piece.length > 0) chunks.push(piece)
    if (end >= normalized.length) break
    start = Math.max(0, end - overlapChars)
  }
  return chunks
}

function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}


io.on('connection', (socket) => {
  console.log('Client connected', socket.id)
  socket.emit('starting new conversation', JSON.stringify(conversationSummariesShort))

  let conversation = [] 



  socket.on('chat message', async (messageData) => {
    try {
      console.log('chat message received')
      let conversation = JSON.parse(messageData) 
      if (!conversation.some(m => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith(CHARACTER_PERSONA))) {
        conversation.unshift({ role: 'system', content: CHARACTER_PERSONA })
      }
      let latestmessage=conversation[conversation.length-1]
      let earlierConvos=await checkIfMessageRefersToEarlierConversation(latestmessage,conversationSummariesShort)
      earlierConvos=JSON.parse(earlierConvos)
      let longSummaries=[]
      if(earlierConvos instanceof Array){
        if(earlierConvos.length>0){
          for(let convo of earlierConvos){
            for(let conversation of conversationSummariesLong){
              if(conversation.id==convo){
                if(!summariesalreadyretrieved.includes(conversation.id)){
                  longSummaries.push(conversation)
                  summariesalreadyretrieved.push(conversation.id)
                }
                if(summariesalreadyretrieved.includes(conversation.id)){
                  console.log("old conversation already been retrieved for this conversation")
                }
              }
            }
          }
        }
      }
      conversation.push({role:`system`,content:`The user is referring back to an earlier conversation or conversations they had with you. 
        Here is a summary or summaries to refresh your memory. "${JSON.stringify(longSummaries)}"`})
      const response = await getSingleResponse(conversation)
      let messageToSend
      if (response && response.message && response.message.content) {
        messageToSend = response.message
      } else {
        messageToSend = { role: 'assistant', content: 'Sorry, I could not generate a response just now.' }
      }
      socket.emit('chat response', JSON.stringify(messageToSend))
    } catch (err) {
      console.error('chat message handler error', err)
      const fallback = { role: 'assistant', content: 'An error occurred handling your message.' }
      socket.emit('chat response', JSON.stringify(fallback))
    }
  })



  socket.on('summarize conversation', async (message) => {
    if (message) {
     await summarizeConversationAndSaveConversations(message)
    }
  })



  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id)
    conversation = [] // Clear conversation array on disconnect
  })
})



  async function getSingleResponse(conversation) {
    console.log(conversation)
    try {
        const completion = await openai.chat.completions.create({
            messages: conversation,
            model: "gpt-4o-mini",
            max_tokens:16000,
          })
          return completion.choices[0]
      } catch (err) {
        console.log(err)
        return "An error occurred. Please try again later."
      }
  }


  async function checkIfMessageRefersToEarlierConversation(message,previousconversations){
    try {
      const response = await openai.chat.completions.create({
          messages: [{ role: "system", content: `Here is a message "${JSON.stringify(message)}". Here are some summaries of previous conversations.
            "${JSON.stringify(previousconversations)}". If the message seems to refer to any of these conversations, return the id numbers of those
            conversation summaries in an array, for example [17,22,24]. If none of the conversation summaries are mentioned, just return an empty array [].` }],
          model: "gpt-4o-mini",
          max_tokens:50
        })
        return response.choices[0].message.content
    } catch (err) {
      console.log(err)
      return "An error occurred. Please try again later."
    }
  }


  async function summarizeConversationAndSaveConversations(conversation) {
    try {
      const parsed = typeof conversation === 'string' ? JSON.parse(conversation) : conversation
      if (!Array.isArray(parsed) || parsed.length === 0) return

      const systemPrompt = `You are to summarize a chat conversation. Return strict JSON with two fields: \n` +
        `{"shortsummary": string (<=3 sentences, user-centric), "longsummary": string (detailed but concise)}.\n` +
        `Do not include markdown fences. Keep names and key facts.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(parsed) }
        ],
        max_tokens: 800
      })

      const raw = completion.choices[0]?.message?.content || '{}'
      let summaryObj
      try {
        summaryObj = JSON.parse(raw)
      } catch (_) {
        // fallback: try to extract JSON substring
        const match = raw.match(/\{[\s\S]*\}/)
        summaryObj = match ? JSON.parse(match[0]) : { shortsummary: '', longsummary: '' }
      }

      const shortsummary = String(summaryObj.shortsummary || '').trim()
      const longsummary = String(summaryObj.longsummary || '').trim()
      if (!shortsummary || !longsummary) return

      // Insert into Supabase table "Jesus"
      const { data, error } = await supabase
        .from('Jesus')
        .insert({ shortsummaries: shortsummary, longsummaries: longsummary })
        .select('*')
        .single()

      if (error) {
        console.error('Error inserting summary:', error)
        return
      }

      // Update in-memory caches
      conversationSummariesShort.unshift({ id: data.id, shortsummary })
      conversationSummariesLong.unshift({ id: data.id, longsummary })
      // Trim caches to 30
      conversationSummariesShort = conversationSummariesShort.slice(0, 30)
      conversationSummariesLong = conversationSummariesLong.slice(0, 30)
    } catch (err) {
      console.error('Error summarizing conversation:', err)
    }
  }




