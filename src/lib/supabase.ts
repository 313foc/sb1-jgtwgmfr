import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// Add to top of file
const REQUIRED_ENV_VARS = {
  VITE_SUPABASE_URL: 'Supabase URL',
  VITE_SUPABASE_ANON_KEY: 'Supabase Anonymous Key',
  VITE_INITIAL_BALANCE: 'Initial Balance',
  VITE_MAX_BET: 'Maximum Bet',
  VITE_MAX_SWEEPS_BET: 'Maximum Sweepstakes Bet'
};

// Set default values if environment variables are missing
const ENV_DEFAULTS = {
  VITE_INITIAL_BALANCE: '1000',
  VITE_INITIAL_SWEEPS: '200',
  VITE_MIN_BET: '10',
  VITE_MAX_BET: '1000',
  VITE_MAX_SWEEPS_BET: '200'
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Add retry wrapper function
const withRetry = async <T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.message === 'Failed to fetch') {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(operation, retries - 1, delay * 2);
      }
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }
    throw error;
  }
};

// Validate all required environment variables
Object.entries(REQUIRED_ENV_VARS).forEach(([key, name]) => {
  if (!import.meta.env[key] && !ENV_DEFAULTS[key]) {
    console.warn(`Missing environment variable: ${key} (${name}). Using default value if available.`);
  }
});

// Get environment variables with validation and defaults
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate Supabase credentials
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
  );
}

// Validate URL format with more detailed error message
try {
  const url = new URL(supabaseUrl);
  if (!url.hostname.includes('supabase.co')) {
    throw new Error('Invalid Supabase URL format. URL must be a valid Supabase project URL (e.g., https://your-project.supabase.co)');
  }
} catch (error) {
  throw new Error(
    'Invalid VITE_SUPABASE_URL format. Please ensure it is a valid URL in the format: https://your-project.supabase.co'
  );
}

// Create Supabase client with error handling
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'waynewagers_auth',
    storage: window.localStorage
  },
  global: {
    headers: {
      'x-application-name': 'waynewagers'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Add error handling to all Supabase calls
const withErrorHandling = async <T>(promise: Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => promise);
  } catch (error) {
    console.error('Supabase error:', error);
    throw error;
  }
};

// Add connection check function
export const checkConnection = async (): Promise<boolean> => {
  try {
    await withRetry(async () => {
      const { data } = await supabase
        .from('connection_test')
        .select('id')
        .limit(1)
        .single();
      return data;
    });
    return true;
  } catch (error) {
    console.error('Connection check failed:', error);
    return false;
  }
};

// Auth functions with proper error handling
export const signUp = async (email: string, password: string, username: string) => {
  try {
    // Check connection first
    const isConnected = await checkConnection();
    if (!isConnected) {
      return {
        data: null,
        error: new Error('Unable to connect to server. Please check your internet connection.')
      };
    }

    // Validate inputs
    if (!email || !password || !username) {
      throw new Error('All fields are required');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    if (username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    // Check if username is available
    const { data: existingUser, error: checkError } = await withErrorHandling(
      supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .maybeSingle()
    );

    if (checkError) throw checkError;
    if (existingUser) {
      throw new Error('Username already taken');
    }

    // Create auth user
    const { data: authData, error: authError } = await withErrorHandling(
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username
          }
        }
      })
    );

    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create user');

    try {
      // Create profile with initial balances
      const { data: profile, error: profileError } = await withErrorHandling(
        supabase
          .from('profiles')
          .insert([{
            id: authData.user.id,
            username,
            regular_balance: parseInt(import.meta.env.VITE_INITIAL_BALANCE || ENV_DEFAULTS.VITE_INITIAL_BALANCE),
            sweeps_balance: parseInt(import.meta.env.VITE_INITIAL_SWEEPS || ENV_DEFAULTS.VITE_INITIAL_SWEEPS),
            vip_level: 1
          }])
          .select()
          .single()
      );

      if (profileError) throw profileError;

      // Record initial balance transactions
      await withErrorHandling(
        supabase.from('transactions').insert([
          {
            user_id: authData.user.id,
            amount: parseInt(import.meta.env.VITE_INITIAL_BALANCE || ENV_DEFAULTS.VITE_INITIAL_BALANCE),
            type: 'bonus',
            game: 'signup',
            currency_type: 'regular'
          },
          {
            user_id: authData.user.id,
            amount: parseInt(import.meta.env.VITE_INITIAL_SWEEPS || ENV_DEFAULTS.VITE_INITIAL_SWEEPS),
            type: 'bonus',
            game: 'signup',
            currency_type: 'sweepstakes'
          }
        ])
      );

      return { data: { user: authData.user, profile }, error: null };
    } catch (error) {
      // If profile creation fails, delete the auth user
      await supabase.auth.signOut();
      throw error;
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('An unexpected error occurred')
    };
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    // Input validation
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Check connection first
    const isConnected = await checkConnection();
    if (!isConnected) {
      return {
        user: null,
        profile: null,
        error: new Error('Unable to connect to server. Please check your internet connection.')
      };
    }

    // Sign in
    const { data: authData, error: authError } = await withRetry(() =>
      supabase.auth.signInWithPassword({
        email,
        password,
      })
    );

    if (authError) {
      // Handle specific auth errors
      if (authError.message.includes('Invalid login credentials')) {
        throw new Error('Invalid email or password');
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error('No user returned from authentication');
    }

    // Get or create profile
    let profile;
    try {
      const { data: existingProfile, error: profileError } = await withRetry(() =>
        supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user!.id)
          .maybeSingle()
      );

      if (profileError) throw profileError;

      if (!existingProfile) {
        // Create profile if it doesn't exist
        const { data: newProfile, error: createError } = await withRetry(() =>
          supabase
            .from('profiles')
            .insert([{
              id: authData.user!.id,
              username: email.split('@')[0], // Use email prefix as default username
              regular_balance: parseInt(import.meta.env.VITE_INITIAL_BALANCE || ENV_DEFAULTS.VITE_INITIAL_BALANCE),
              sweeps_balance: parseInt(import.meta.env.VITE_INITIAL_SWEEPS || ENV_DEFAULTS.VITE_INITIAL_SWEEPS),
              vip_level: 1
            }])
            .select()
            .single()
        );

        if (createError) throw createError;
        profile = newProfile;

        // Record initial balance transactions
        await withRetry(() =>
          supabase.from('transactions').insert([
            {
              user_id: authData.user!.id,
              amount: parseInt(import.meta.env.VITE_INITIAL_BALANCE || ENV_DEFAULTS.VITE_INITIAL_BALANCE),
              type: 'bonus',
              game: 'signup',
              currency_type: 'regular'
            },
            {
              user_id: authData.user!.id,
              amount: parseInt(import.meta.env.VITE_INITIAL_SWEEPS || ENV_DEFAULTS.VITE_INITIAL_SWEEPS),
              type: 'bonus',
              game: 'signup',
              currency_type: 'sweepstakes'
            }
          ])
        );
      } else {
        profile = existingProfile;
      }

      return { user: authData.user, profile, error: null };
    } catch (error) {
      // If profile operations fail, sign out and throw error
      await supabase.auth.signOut();
      throw error;
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('Unable to connect')) {
        return {
          user: null,
          profile: null,
          error: new Error('Unable to connect to server. Please check your internet connection.')
        };
      }
      return {
        user: null,
        profile: null,
        error: error
      };
    }
    return {
      user: null,
      profile: null,
      error: new Error('An unexpected error occurred')
    };
  }
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
};

export const updateProfile = async (userId: string, updates: any) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Currency constants
export const CURRENCY_MULTIPLIER = 100; // Store amounts in cents
export const formatCurrency = (amount: number) => (amount / CURRENCY_MULTIPLIER).toFixed(2);
export const toCents = (dollars: number) => Math.round(dollars * CURRENCY_MULTIPLIER);

// Currency-specific functions
export const updateBalance = async (
  userId: string,
  amount: number,
  currencyType: 'regular' | 'sweepstakes'
) => {
  const field = currencyType === 'regular' ? 'regular_balance' : 'sweeps_balance';
  const { data, error } = await supabase.rpc('update_balances', {
    p_user_id: userId,
    p_regular_amount: currencyType === 'regular' ? amount : 0,
    p_sweeps_amount: currencyType === 'sweepstakes' ? amount : 0
  });

  if (error) throw error;
  return data;
};

export const recordTransaction = async (
  userId: string,
  amount: number,
  type: 'bet' | 'win' | 'loss' | 'bonus' | 'purchase',
  game: string,
  currencyType: 'regular' | 'sweepstakes'
) => {
  const { error } = await supabase
    .from('transactions')
    .insert([{
      user_id: userId,
      amount,
      type,
      game,
      currency_type: currencyType
    }]);

  if (error) throw error;
};

// Add environment variable getters with currency conversion
export const getInitialBalance = (type: 'regular' | 'sweepstakes') => 
  type === 'regular'
    ? toCents(parseInt(import.meta.env.VITE_INITIAL_BALANCE || ENV_DEFAULTS.VITE_INITIAL_BALANCE))
    : toCents(parseInt(import.meta.env.VITE_INITIAL_SWEEPS || ENV_DEFAULTS.VITE_INITIAL_SWEEPS));

export const getMinBet = (type: 'regular' | 'sweepstakes') =>
  type === 'regular'
    ? toCents(parseInt(import.meta.env.VITE_MIN_BET || ENV_DEFAULTS.VITE_MIN_BET))
    : toCents(parseInt(import.meta.env.VITE_MIN_BET || ENV_DEFAULTS.VITE_MIN_BET));

export const getMaxBet = (type: 'regular' | 'sweepstakes') =>
  type === 'regular'
    ? toCents(parseInt(import.meta.env.VITE_MAX_BET || ENV_DEFAULTS.VITE_MAX_BET))
    : toCents(parseInt(import.meta.env.VITE_MAX_SWEEPS_BET || ENV_DEFAULTS.VITE_MAX_SWEEPS_BET));

export const isFeatureEnabled = (feature: 'tournaments' | 'achievements' | 'chat') => {
  const envVar = `VITE_ENABLE_${feature.toUpperCase()}`;
  return import.meta.env[envVar] !== 'false';
};