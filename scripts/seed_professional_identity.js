// scripts/seed_professional_identity.js
// Seeds and anchors Swapnil's Official Professional Identity into Supabase (profiles, memories, current_state)

const { supabaseRequest } = require('../actions_handler');

async function main() {
  console.log('--- Anchoring Swapnil Official Professional Identity: Product Designer & Builder ---');

  const officialHeadline = 'Product Designer & Builder | Turning Real-World Problems into Digital Products | AI, Frontend & Automation | Creator of Edu51Portal | Final year CSE at BUBT';
  const preferredDescription = 'Md. Miftahur Rahman Swapnil is a final-year CSE student at BUBT and a Product Designer & Builder focused on turning real-world problems into digital products. He works across AI, frontend development, and automation, using AI-assisted development to rapidly turn ideas into functional products. He is also the creator of Edu51Portal and actively explores AI systems, automation, web development, and research.';
  const shortDescription = 'Swapnil is a final-year CSE student at BUBT and a Product Designer & Builder focused on turning real-world problems into digital products through AI, frontend development, and automation.';
  const oneLineIdentity = 'Product Designer & Builder who turns real-world problems into digital products through AI, frontend development, and automation.';

  // 1. Fetch current profile
  console.log('\n1. Fetching profile...');
  try {
    const profiles = await supabaseRequest('/profiles?select=*', 'GET');
    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      console.log(`Found profile ${profile.id}, updating...`);

      const updatedMetadata = {
        ...(profile.metadata || {}),
        official_headline: officialHeadline,
        headline: officialHeadline,
        primary_title: 'Product Designer & Builder',
        supporting_areas: ['AI', 'Frontend Development', 'Automation', 'AI-assisted development', 'Product prototyping', 'Web and application development', 'Real-world problem solving'],
        academic_identity: 'Final-year CSE student at Bangladesh University of Business and Technology (BUBT)',
        institution: 'Bangladesh University of Business and Technology (BUBT)',
        core_philosophy: 'Turning Real-World Problems into Digital Products',
        product_mindset: 'Real-world problem → Product idea → User experience → Design → Development → AI/API integration → Working product',
        development_style: 'Vibe coding / AI-assisted coding (Workflow). Formal: AI-assisted development or AI-assisted coding',
        preferred_description: preferredDescription,
        short_description: shortDescription,
        one_line_identity: oneLineIdentity,
        positioning_rule: 'Primary title is Product Designer & Builder. Core positioning is Turning Real-World Problems into Digital Products. Do NOT automatically call him a Full-Stack Developer. Avoid exaggerated senior titles.',
        edu51portal: {
          role: 'Creator',
          status: 'Active (~100 BUBT engineering students)',
          backend: 'Supabase',
          study_materials: 'Google Drive API (NEVER Firebase)',
          purpose: 'Education platform for BUBT students'
        }
      };

      const updateRes = await supabaseRequest(`/profiles?id=eq.${profile.id}`, 'PATCH', {
        career_direction: 'Product Designer & Builder',
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      });

      console.log('Profile updated successfully:', updateRes[0]?.career_direction || 'OK');
    }
  } catch (err) {
    console.error('Error updating profiles:', err.message);
  }

  // 2. Upsert into current_state
  console.log('\n2. Upserting into current_state...');
  try {
    const stateVal = {
      official_headline: officialHeadline,
      primary_title: 'Product Designer & Builder',
      supporting_areas: ['AI', 'Frontend Development', 'Automation', 'AI-assisted development'],
      academic: 'Final-year CSE student at Bangladesh University of Business and Technology (BUBT)',
      dev_style: 'vibe coding / AI-assisted coding (formal: AI-assisted development)',
      core_philosophy: 'Turning Real-World Problems into Digital Products',
      product_mindset: 'Real-world problem → Product idea → User experience → Design → Development → AI/API integration → Working product',
      rules: [
        'Use Product Designer & Builder as his primary identity.',
        'Use Turning Real-World Problems into Digital Products as core positioning.',
        'Mention AI, Frontend & Automation as primary supporting areas.',
        'Do NOT automatically call him a Full-Stack Developer.',
        'Do NOT exaggerate technical seniority (present as real student-builder, not corporate executive or seasoned architect).',
        'Vibe coder describes workflow, not formal title. Use AI-assisted development for formal contexts.',
        'Edu51Portal backend is Supabase + Google Drive API (NEVER Firebase).'
      ]
    };

    const existingState = await supabaseRequest('/current_state?area=eq.professional_identity&key=eq.swapnil_current_identity', 'GET');
    if (existingState && existingState.length > 0) {
      await supabaseRequest('/current_state?area=eq.professional_identity&key=eq.swapnil_current_identity', 'PATCH', {
        value: stateVal,
        updated_at: new Date().toISOString()
      });
      console.log('current_state updated');
    } else {
      await supabaseRequest('/current_state', 'POST', {
        area: 'professional_identity',
        key: 'swapnil_current_identity',
        value: stateVal,
        updated_at: new Date().toISOString()
      });
      console.log('current_state inserted');
    }
  } catch (err) {
    console.error('Error updating current_state:', err.message);
  }

  // 3. Insert definitive memories
  console.log('\n3. Inserting identity memories...');
  const identityMemories = [
    {
      content: `SWAPNIL OFFICIAL HEADLINE: "${officialHeadline}". Use it as the default professional positioning for LinkedIn, portfolio, introductions, and professional conversations.`,
      memory_type: 'instruction',
      importance: 10,
      confidence: 1.0,
      metadata: { tags: ['headline', 'identity', 'linkedin', 'professional', 'official', 'product-designer-builder'] }
    },
    {
      content: `SWAPNIL CORE PROFESSIONAL IDENTITY: Primary title is "Product Designer & Builder". Core philosophy: "Turning Real-World Problems into Digital Products". Supporting areas: AI, Frontend Development, Automation. Do NOT automatically call him a Full-Stack Developer. Avoid exaggerated corporate senior titles.`,
      memory_type: 'fact',
      importance: 10,
      confidence: 1.0,
      metadata: { tags: ['positioning', 'title', 'product-designer-builder', 'cse-student', 'bubt'] }
    },
    {
      content: `SWAPNIL DEVELOPMENT STYLE: Describes workflow as "vibe coding / AI-assisted coding". In casual contexts, "vibe coder" is fine. In formal contexts (CVs, job apps, academic docs), ALWAYS use "AI-assisted development" or "AI-assisted coding".`,
      memory_type: 'workflow',
      importance: 9,
      confidence: 1.0,
      metadata: { tags: ['workflow', 'vibe-coding', 'ai-assisted-coding', 'development-style'] }
    },
    {
      content: `SWAPNIL PRODUCT MINDSET: Real-world problem → Product idea → User experience → Design → Development → AI/API integration → Working product. Focus on actual problems solved, user interaction, interface feel, and automation.`,
      memory_type: 'preference',
      importance: 9,
      confidence: 1.0,
      metadata: { tags: ['philosophy', 'product-mindset', 'ux', 'user-experience', 'product-design'] }
    },
    {
      content: `EDU51PORTAL ARCHITECTURE & POSITIONING: Swapnil is the Creator. Education platform for BUBT students (~100 active users). Backend: Supabase. Study materials: Google Drive API. NEVER describe Edu51Portal as Firebase-based.`,
      memory_type: 'fact',
      importance: 10,
      confidence: 1.0,
      metadata: { tags: ['edu51portal', 'supabase', 'google-drive-api', 'creator'] }
    },
    {
      content: `CANONICAL DESCRIPTIONS OF SWAPNIL: Preferred: "${preferredDescription}" | Short: "${shortDescription}" | One-Line: "${oneLineIdentity}"`,
      memory_type: 'instruction',
      importance: 10,
      confidence: 1.0,
      metadata: { tags: ['bio', 'description', 'canonical', 'intro'] }
    }
  ];

  for (const mem of identityMemories) {
    try {
      await supabaseRequest('/memories', 'POST', mem);
      console.log(`Memory inserted: [${mem.metadata.tags[0]}]`);
    } catch (err) {
      console.error(`Error inserting memory [${mem.metadata.tags[0]}]:`, err.message);
    }
  }

  console.log('\n--- Done anchoring Swapnil Official Identity: Product Designer & Builder! ---');
}

main().catch(console.error);
