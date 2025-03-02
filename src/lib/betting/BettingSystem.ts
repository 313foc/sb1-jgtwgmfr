import { supabase, CURRENCY_MULTIPLIER, formatCurrency } from '../supabase';
import { antiCheat } from '../security/antiCheat';
import { getMinBet, getMaxBet } from '../supabase';

export class BettingSystem {
  private static instance: BettingSystem;
  private readonly minBet: number;
  private readonly maxBet: number;
  private initialized: boolean = false;

  private constructor() {
    this.minBet = getMinBet('regular');
    this.maxBet = getMaxBet('regular');
  }

  public static getInstance(): BettingSystem {
    if (!BettingSystem.instance) {
      BettingSystem.instance = new BettingSystem();
    }
    return BettingSystem.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Verify connection to Supabase
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize betting system:', error);
      throw error;
    }
  }

  async placeBet(
    userId: string,
    gameId: string,
    amount: number,
    gameType: string,
    currencyType: 'regular' | 'sweepstakes' = 'regular'
  ): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get currency-specific limits
      const minBet = getMinBet(currencyType);
      const maxBet = getMaxBet(currencyType);

      // Validate bet amount
      if (amount < minBet || amount > maxBet) {
        throw new Error(`Invalid bet amount. Must be between $${formatCurrency(minBet)} and $${formatCurrency(maxBet)}`);
      }

      // Get user's current balance
      const { data: profile } = await supabase
        .from('profiles')
        .select('regular_balance, sweeps_balance, vip_level')
        .eq('id', userId)
        .single();

      if (!profile) {
        throw new Error('User profile not found');
      }

      const balance = currencyType === 'regular' ? profile.regular_balance : profile.sweeps_balance;
      if (balance < amount) {
        throw new Error(`Insufficient ${currencyType} balance. Need $${formatCurrency(amount)}`);
      }

      // Anti-cheat validation
      const isValid = await antiCheat.validateAction(gameId, userId, {
        type: 'bet',
        data: { amount, currencyType },
        timestamp: new Date().toISOString(),
        sessionId: gameId,
        userId
      });

      if (!isValid) {
        throw new Error('Bet validation failed');
      }

      // Update balance using RPC function
      const { error: balanceError } = await supabase.rpc('update_balances', {
        p_user_id: userId,
        p_regular_amount: currencyType === 'regular' ? -amount : 0,
        p_sweeps_amount: currencyType === 'sweepstakes' ? -amount : 0
      });

      if (balanceError) throw balanceError;

      // Record transaction
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          user_id: userId,
          amount: -amount,
          type: 'bet',
          game: gameType,
          currency_type: currencyType
        }]);

      if (transactionError) throw transactionError;

      return true;
    } catch (error) {
      console.error('Error placing bet:', error);
      return false;
    }
  }

  async resolveBet(
    userId: string,
    gameId: string,
    amount: number,
    won: boolean,
    currencyType: 'regular' | 'sweepstakes' = 'regular'
  ): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      if (won) {
        // Update balance using RPC function
        const { error: balanceError } = await supabase.rpc('update_balances', {
          p_user_id: userId,
          p_regular_amount: currencyType === 'regular' ? amount : 0,
          p_sweeps_amount: currencyType === 'sweepstakes' ? amount : 0
        });

        if (balanceError) throw balanceError;

        // Record win transaction
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert([{
            user_id: userId,
            amount,
            type: 'win',
            game: gameId,
            currency_type: currencyType
          }]);

        if (transactionError) throw transactionError;
      }

      return true;
    } catch (error) {
      console.error('Error resolving bet:', error);
      return false;
    }
  }

  async getPlayerLimits(userId: string, currencyType: 'regular' | 'sweepstakes' = 'regular'): Promise<{
    minBet: number;
    maxBet: number;
    dailyLimit: number;
    remainingDaily: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('vip_level')
      .eq('id', userId)
      .single();

    if (!profile) {
      throw new Error('User profile not found');
    }

    const minBet = getMinBet(currencyType);
    const baseMaxBet = getMaxBet(currencyType);
    const vipMultiplier = 1 + (profile.vip_level - 1) * 0.5;
    const maxBet = Math.floor(baseMaxBet * vipMultiplier);
    const dailyLimit = maxBet * 100;

    // Get today's bets
    const today = new Date().toISOString().split('T')[0];
    const { data: dailyBets } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'bet')
      .eq('currency_type', currencyType)
      .gte('created_at', today);

    const dailyWagered = dailyBets?.reduce((sum, bet) => sum + Math.abs(bet.amount), 0) || 0;

    return {
      minBet,
      maxBet,
      dailyLimit,
      remainingDaily: Math.max(0, dailyLimit - dailyWagered)
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Helper methods for bet increments
  getIncrementAmount(currencyType: 'regular' | 'sweepstakes' = 'regular'): number {
    return getMinBet(currencyType);
  }

  getDefaultBet(currencyType: 'regular' | 'sweepstakes' = 'regular'): number {
    return getMinBet(currencyType);
  }
}

export const bettingSystem = BettingSystem.getInstance();