import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kasamrxtbvebnwxriila.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HXAzbq8K0wf2nIP0U_L6VA_q_XvGaFx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
