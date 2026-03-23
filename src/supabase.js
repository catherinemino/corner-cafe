import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kasamrxtbvebnwxriila.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthc2Ftcnh0YnZlYm53eHJpaWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MzA1NTYsImV4cCI6MjA4ODQwNjU1Nn0.98Tx4r3IK8blhTc6N2BLQ-xlaSkrcvfV3v2dQBXKW5c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
