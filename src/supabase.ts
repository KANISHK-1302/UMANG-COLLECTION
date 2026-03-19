import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const createSafeProxy = (name: string): any => {
  return new Proxy(() => {}, {
    get: (target, prop) => {
      if (prop === 'then') return undefined;
      return createSafeProxy(`${name}.${String(prop)}`);
    },
    apply: (target, thisArg, args) => {
      console.warn(`Supabase call ignored: ${name}(). Missing environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`);
      return Promise.resolve({ data: null, error: null, subscription: { unsubscribe: () => {} } });
    }
  });
};

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createSafeProxy('supabase');
