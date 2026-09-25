const { storeMemoryWithConflictResolution } = require('../actions_handler');

async function run() {
  const mem1 = await storeMemoryWithConflictResolution({
    content: 'Md. Miftahur Rahman Swapnil completed his Secondary School Certificate (SSC) in Science with GPA 5.00/5.00 from Kadirabad BL High School, Pirganj, Rangpur (2019). HSC was Shaheed Police Smrity College (2021).',
    memory_type: 'PROFILE',
    importance: 10,
    confidence: 1.0,
    user_message: 'my ssc from Kadirabad BL High School pirganj,Rangpur'
  });
  console.log('Stored SSC memory:', mem1?.action);

  const mem2 = await storeMemoryWithConflictResolution({
    content: 'SWAPNIL OFFICIAL HEADLINE: "Product Designer & Builder | AI, Frontend & Automation". Use this as his updated headline across CV, portfolio, and professional conversations.',
    memory_type: 'PROFILE',
    importance: 10,
    confidence: 1.0,
    user_message: 'change to Product Designer & Builder, AI, Frontend & Automation'
  });
  console.log('Stored Headline memory:', mem2?.action);

  const mem3 = await storeMemoryWithConflictResolution({
    content: 'Swapnil accepted research paper is officially titled: "Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite QA" (IEEE OMLET 2026). His ongoing research includes "EEG-Based Motor Imagery Classification" (deep learning for assistive neuro-rehabilitation and paralysis motor control) and "AI-Enabled Smart Classroom Monitoring and Safety Automation".',
    memory_type: 'KNOWLEDGE',
    importance: 10,
    confidence: 1.0,
    user_message: 'accepted paper is Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite QA and EEG based is running'
  });
  console.log('Stored Research memory:', mem3?.action);

  const mem4 = await storeMemoryWithConflictResolution({
    content: 'Swapnil leadership roles: BASIS Students\' Forum - BUBT Chapter (Member, Graphics Designer, Media & Publication Secretary, 2023–2026), BUBT IT Club (General Member), and internal university event management organizer.',
    memory_type: 'CAREER',
    importance: 9,
    confidence: 1.0,
    user_message: 'Basis Student forum of BUBT chapter club member, Graphics Designer and Media and publication Secretary (2023-2026), IT club General member, event management'
  });
  console.log('Stored Leadership memory:', mem4?.action);
}

run().catch(console.error);
