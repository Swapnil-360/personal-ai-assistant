// scripts/seed_professional_identity.js
// Seeds and anchors Swapnil's Official Professional Identity into Supabase (profiles, memories, current_state)

const { supabaseRequest } = require('../actions_handler');

async function main() {
  console.log('--- Anchoring Swapnil Official Professional Identity ---');

  const officialHeadline = 'Full-Stack Developer & AI Systems Builder | Next.js, TypeScript, Supabase | Creator of Edu51Portal | Committed to Enhancing User Experiences Through Technology | BUBT CSE';
  const preferredDescription = 'Swapnil is a CSE student and Full-Stack Developer & AI Systems Builder who enjoys turning real-world problems into working digital products. He works with technologies such as Next.js, TypeScript, and Supabase, and is actively exploring AI systems, automation, and AI-assisted development. He is also the creator of Edu51Portal.';
  const shortDescription = 'Swapnil is a CSE student, Full-Stack Developer, and AI Systems Builder focused on building practical digital products.';
  const veryShortDescription = 'Full-Stack Developer & AI Systems Builder | CSE @ BUBT | Creator of Edu51Portal.';

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
        primary_title: 'Full-Stack Developer & AI Systems Builder',
        supporting_title: 'Product Builder',
        academic_identity: 'CSE Student @ Bangladesh University of Business and Technology (BUBT)',
        institution: 'Bangladesh University of Business and Technology (BUBT)',
        development_style: 'Vibe coding / AI-assisted coding (Workflow). Formal: AI-assisted development',
        product_mindset: 'Problem → Idea → Product → Design → Development → Integration → Working Solution',
        user_experience_focus: 'Committed to Enhancing User Experiences Through Technology',
        preferred_description: preferredDescription,
        short_description: shortDescription,
        very_short_description: veryShortDescription,
        positioning_rule: 'NEVER replace headline with Product Designer & Builder. Default title is Full-Stack Developer & AI Systems Builder.',
        edu51portal: {
          role: 'Creator',
          status: 'Active (~100 BUBT engineering students)',
          backend: 'Supabase',
          study_materials: 'Google Drive API (NEVER Firebase)',
          purpose: 'Education platform for BUBT students'
        }
      };

      const updateRes = await supabaseRequest(`/profiles?id=eq.${profile.id}`, 'PATCH', {
        career_direction: 'Full-Stack Developer & AI Systems Builder',
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
      primary_title: 'Full-Stack Developer & AI Systems Builder',
      supporting_title: 'Product Builder',
      academic: 'CSE Student at Bangladesh University of Business and Technology (BUBT)',
      dev_style: 'vibe coding / AI-assisted coding (formal: AI-assisted development)',
      product_mindset: 'Problem → Idea → Product → Design → Development → Integration → Working Solution',
      core_philosophy: 'I build digital products around real-world problems.',
      ux_philosophy: 'Committed to Enhancing User Experiences Through Technology (technical implementation + UX)',
      rules: [
        'Treat official headline as Swapnil current official headline.',
        'Do NOT replace headline with Product Designer & Builder.',
        'Full-Stack Developer is chosen primary positioning.',
        'AI Systems Builder is second major positioning.',
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
      content: `SWAPNIL OFFICIAL HEADLINE: "${officialHeadline}". Rule: Treat this as Swapnil's current official headline. Do NOT replace with "Product Designer & Builder" unless Swapnil specifically asks.`,
      memory_type: 'instruction',
      importance: 10,
      confidence: 1.0,
      metadata: { tags: ['headline', 'identity', 'linkedin', 'professional', 'official', 'full-stack'] }
    },
    {
      content: `SWAPNIL PROFESSIONAL POSITIONING: Primary Public Title is "Full-Stack Developer & AI Systems Builder". Supporting title is "Product Builder" ("I build digital products around real-world problems."). Academic identity is "CSE Student @ BUBT".`,
      memory_type: 'fact',
      importance: 10,
      confidence: 1.0,
      metadata: { tags: ['positioning', 'title', 'product-builder', 'cse-student', 'bubt'] }
    },
    {
      content: `SWAPNIL DEVELOPMENT STYLE: Describes workflow as "vibe coding / AI-assisted coding". In casual contexts, "vibe coder" is fine. In formal contexts (CVs, job apps, academic docs), ALWAYS use "AI-assisted development" or "AI-assisted coding".`,
      memory_type: 'workflow',
      importance: 9,
      confidence: 1.0,
      metadata: { tags: ['workflow', 'vibe-coding', 'ai-assisted-coding', 'development-style'] }
    },
    {
      content: `SWAPNIL PRODUCT-BUILDING MINDSET & UX: Problem → Idea → Product → Design → Development → Integration → Working Solution. UX is critical: "Committed to Enhancing User Experiences Through Technology". Always balance technical implementation with user experience.`,
      memory_type: 'preference',
      importance: 9,
      confidence: 1.0,
      metadata: { tags: ['philosophy', 'product-mindset', 'ux', 'user-experience'] }
    },
    {
      content: `EDU51PORTAL ARCHITECTURE & POSITIONING: Swapnil is the Creator. Education platform for BUBT students (~100 active users). Backend: Supabase. Study materials: Google Drive API. NEVER describe Edu51Portal as Firebase-based.`,
      memory_type: 'fact',
      importance: 10,
      confidence: 1.0,
      metadata: { tags: ['edu51portal', 'supabase', 'google-drive-api', 'creator'] }
    },
    {
      content: `CANONICAL DESCRIPTIONS OF SWAPNIL: Preferred: "${preferredDescription}" | Short: "${shortDescription}" | Very Short: "${veryShortDescription}"`,
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

  console.log('\n--- Done anchoring Swapnil Official Identity! ---');
}

main().catch(console.error);
