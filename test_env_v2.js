import 'dotenv/config';
console.log('REASONER_PORT:', process.env.LLAMA_PORT_REASONER);
console.log('WORKER_PORT:', process.env.LLAMA_PORT_WORKER);
console.log('REASONER_MODEL:', process.env.LLM_MODEL_REASONER);
console.log('WORKER_MODEL:', process.env.LLM_MODEL_WORKER);
console.log('LLM_MODEL:', process.env.LLM_MODEL);
