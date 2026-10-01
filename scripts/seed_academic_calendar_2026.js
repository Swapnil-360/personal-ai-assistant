const { supabaseRequest, storeMemoryWithConflictResolution } = require('../actions_handler');

async function main() {
    console.log('--- Seeding BUBT Academic Calendar 2026 & Final Semester Context ---');

    // 1. Store Structured Academic Calendar in Supabase current_state
    const calendarData = {
        university: 'Bangladesh University of Business and Technology (BUBT)',
        year: 2026,
        is_final_bsc_semester: true,
        degree: 'Bachelor of Science in Computer Science & Engineering (B.Sc. in CSE)',
        current_semester: {
            name: 'Fall 2026',
            timeline: '05 September 2026 - 31 December 2026',
            status: 'Running / Final Undergraduate Semester',
            milestones: [
                { date: '2026-09-05', event: 'Orientation & Commencement of Classes' },
                { date: '2026-09-23', event: 'Publication of final list of registered students' },
                { date: '2026-09-27', event: 'Census Day' },
                { date: '2026-09-27 to 2026-10-01', event: 'R U OK!' },
                { date: '2026-10-03', event: 'Parents Day' },
                { date: '2026-10-13 to 2026-10-22', event: '2nd Installment Payment (min 50% dues)' },
                { date: '2026-10-21 to 2026-10-22', event: 'Durga Puja Holiday' },
                { date: '2026-10-23', event: 'Preparatory Leave for Midterm Exam' },
                { date: '2026-10-24 to 2026-10-31', event: 'Midterm Examination' },
                { date: '2026-11-09 to 2026-11-12', event: 'Supplementary Mid-term Exam' },
                { date: '2026-11-22 to 2026-11-29', event: 'Pre-Registration for Spring 2027 (N/A - Graduating)' },
                { date: '2026-11-25 to 2026-12-10', event: 'Final Installment Fees (without late fee)' },
                { date: '2026-12-11 to 2026-12-15', event: 'Final Installment Fees (with late fee)' },
                { date: '2026-12-15', event: 'Last Day of Classes before Final Exam' },
                { date: '2026-12-16', event: 'Victory Day (National Holiday)' },
                { date: '2026-12-17 to 2026-12-24', event: 'Final Examination (Final B.Sc. Exams!)' },
                { date: '2026-12-25', event: 'Christmas Day (Holiday)' },
                { date: '2026-12-28', event: 'Final Result Publication (Official Graduation / B.Sc. Over)' },
                { date: '2026-12-29 to 2026-12-31', event: 'Semester Break / Degree Completed' }
            ],
            payment_schedule: {
                installment_1: '05 Sep - 17 Sep 2026 (1st Installment without late fee)',
                registration_confirmation_late: '18 Sep - 22 Oct 2026',
                installment_2: '13 Oct - 22 Oct 2026 (At least 50% of total dues)',
                final_installment_regular: '25 Nov - 10 Dec 2026 (Without late fee)',
                final_installment_late: '11 Dec - 15 Dec 2026 (With late fee)'
            }
        }
    };

    try {
        const rows = await supabaseRequest('/current_state?area=eq.academic&key=eq.bubt_fall_2026_calendar', 'GET');
        if (!rows || rows.length === 0) {
            await supabaseRequest('/current_state', 'POST', {
                area: 'academic',
                key: 'bubt_fall_2026_calendar',
                value: calendarData,
                status: 'active'
            });
            console.log('✅ Created bubt_fall_2026_calendar in current_state');
        } else {
            await supabaseRequest('/current_state?area=eq.academic&key=eq.bubt_fall_2026_calendar', 'PATCH', {
                value: calendarData,
                updated_at: new Date().toISOString()
            });
            console.log('✅ Updated bubt_fall_2026_calendar in current_state');
        }
    } catch (e) {
        console.warn('⚠️ Could not update current_state calendar:', e.message);
    }

    // 2. Insert Core Memories via Conflict Resolution
    const memoriesToStore = [
        {
            content: "BUBT Final Semester & B.Sc. Graduation: Fall 2026 (05 September 2026 – 31 December 2026) is Swapnil's final running undergraduate semester for his Bachelor of Science in Computer Science & Engineering (B.Sc. in CSE) at BUBT. Upon completion of this semester in December 2026, his B.Sc. degree will be officially over and graduated.",
            memory_type: 'ACADEMIC',
            importance: 10,
            confidence: 1.0,
            user_message: "it's my this semester academic calander if all recognible then I want to learn this to model so she know about it and after all of this my bsc will over means this is the last semester calander about my running semester"
        },
        {
            content: "BUBT Fall 2026 Midterm Exams Schedule: Preparatory leave is Friday, 23 October 2026. Midterm Examinations run from 24 October to 31 October 2026. Supplementary Midterms are 09–12 November 2026.",
            memory_type: 'ACADEMIC',
            importance: 10,
            confidence: 1.0,
            user_message: "BUBT Fall 2026 Midterm Exam Schedule"
        },
        {
            content: "BUBT Fall 2026 Final Exams & Degree Completion: Last day of classes before finals is 15 December 2026. Final Examinations (Swapnil's final undergraduate exams) run from 17 December to 24 December 2026. Official Final Result Publication is 28 December 2026, marking the completion of his B.Sc. in CSE.",
            memory_type: 'ACADEMIC',
            importance: 10,
            confidence: 1.0,
            user_message: "BUBT Fall 2026 Final Exam and B.Sc. result publication date"
        },
        {
            content: "BUBT Fall 2026 Key Deadlines & Holidays: Parents Day is 03 October 2026. 2nd Installment payment (min 50% dues) is 13–22 October 2026. Durga Puja holiday is 21–22 October 2026. Final fee installment is 25 Nov – 10 Dec 2026 (late fee until 15 Dec 2026). Victory Day is 16 Dec 2026. Semester break is 29–31 Dec 2026.",
            memory_type: 'ACADEMIC',
            importance: 9,
            confidence: 1.0,
            user_message: "BUBT Fall 2026 payment deadlines and holidays"
        }
    ];

    for (const mem of memoriesToStore) {
        try {
            const res = await storeMemoryWithConflictResolution(mem);
            console.log(`✅ Stored Memory [${mem.memory_type}]: ${res?.action || 'saved'} - "${mem.content.slice(0, 65)}..."`);
        } catch (err) {
            console.warn('⚠️ Error storing memory:', err.message);
        }
    }

    console.log('--- Seeding Completed Successfully ---');
}

main().catch(console.error);
