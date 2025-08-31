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
    // Delete all records except the 20 most recent ones
    const { error } = await supabase
      .from('Jesus')
      .delete()
      .lt('created_at', 
        supabase
          .from('Jesus')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .offset(19)
      );
    
    if (error) {
      console.error('Error cleaning up old records:', error);
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
const server = app.listen(process.env.PORT, () => console.log(`Server listening on port ${process.env.PORT}`))
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"]
  }
});
let conversationSummariesShort=[]
let conversationSummariesLong=[]
let summariesalreadyretrieved=[]
  getSummaries()
  

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

function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}


io.on('connection', (socket) => {
  socket.emit('starting new conversation', JSON.stringify(conversationSummariesShort))

  let conversation = [] 



  socket.on('chat message', async (messageData) => {
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
    socket.emit('chat response', JSON.stringify(response['message']))
  })



  socket.on('summarize conversation', async (message) => {
    if (message) {
     await summarizeConversationAndSaveConversations(message)
    }
  })



  socket.on('disconnect', () => {
    console.log('Client disconnected')
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
    console.log('Summarizing conversation:', conversation);

    if (!fs.existsSync(folderPath)) {
        console.error('Folder path does not exist:', folderPath);
        return;
    }

    fs.readdir(folderPath, async (err, files) => {
        if (err) {
            console.error('Unable to read folder:', err);
            return;
        }

        const summaryPromises = files.map(async (file) => {
            const filePath = path.join(folderPath, file);

            if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
                try {
                    const content = await fs.promises.readFile(filePath, 'utf-8');

                    console.log(`Content of ${file}:`);
                    console.log(content);
                    let tokenEstimate=estimateTokenCount(content)
                    if(tokenEstimate>16000){
                      let numofsplits=Math.ceil(tokenEstimate/16000)
                      content=content
                    }
                    const summary = await openai.chat.completions.create({
                      messages: [{ role: "system", content: `Summarize the following code file, describing its main features. If it is JavaScript, describe what each function does, focusing on accurate descriptions of the inputs and outputs. The summary should be about a quarter the length of the actual code file:\n\n${content}` }],
                      max_tokens:16000,
                      model: "gpt-4o-mini",
                    }).catch(function(reason) {
                      console.log("error", reason);
                    });

                    const summarizedContent = summary.data.choices[0].message.content;
                    console.log(`Summary of ${file}:`);
                    console.log(summarizedContent);

                    // Here you can save the summaries to your database

                } catch (err) {
                    console.error(`Error processing file ${file}:`, err);
                }
            }
        });

        await Promise.all(summaryPromises);
    });
}




