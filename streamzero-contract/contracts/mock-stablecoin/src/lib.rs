#![no_std]
//! Mock stablecoin — a minimal SEP-41 fungible token standing in for USDC while
//! StreamZero is on testnet. Swap this for the real USDC Stellar Asset Contract
//! in production; the StreamZero vault only relies on the standard `transfer`
//! and `balance` entrypoints, so no vault changes are needed.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

#[cfg(test)]
mod test;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Balance(Address),
    Allowance(AllowanceKey),
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceKey {
    pub from: Address,
    pub spender: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    InsufficientBalance = 2,
    InsufficientAllowance = 3,
    InvalidAmount = 4,
    InvalidExpiration = 5,
}

const DECIMALS: u32 = 7;
/// Max a single faucet call can mint (1,000,000.0000000 with 7 decimals).
const MAX_FAUCET: i128 = 1_000_000 * 10_000_000;

#[contract]
pub struct MockStablecoin;

#[contractimpl]
impl MockStablecoin {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Admin-only faucet so demos can hand out test "USDC".
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        if amount < 0 {
            return Err(Error::InvalidAmount);
        }
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        let balance = read_balance(&env, &to);
        write_balance(&env, &to, balance + amount);
        Ok(())
    }

    /// Open testnet faucet: anyone can mint up to `MAX_FAUCET` to themselves.
    /// Demo-only convenience so an employer can fund a stream without admin.
    pub fn faucet(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        to.require_auth();
        if amount <= 0 || amount > MAX_FAUCET {
            return Err(Error::InvalidAmount);
        }
        let balance = read_balance(&env, &to);
        write_balance(&env, &to, balance + amount);
        Ok(())
    }

    // --- SEP-41 ------------------------------------------------------------

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&env, &from, &spender).amount
    }

    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) -> Result<(), Error> {
        from.require_auth();
        if amount < 0 {
            return Err(Error::InvalidAmount);
        }
        if expiration_ledger < env.ledger().sequence() && amount > 0 {
            return Err(Error::InvalidExpiration);
        }
        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender: spender.clone(),
        });
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount,
                expiration_ledger,
            },
        );
        if amount > 0 {
            let live = expiration_ledger
                .checked_sub(env.ledger().sequence())
                .unwrap_or(0);
            if live > 0 {
                env.storage().temporary().extend_ttl(&key, live, live);
            }
        }
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        read_balance(&env, &id)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        do_transfer(&env, &from, &to, amount)
    }

    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount)?;
        do_transfer(&env, &from, &to, amount)
    }

    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        do_burn(&env, &from, amount)
    }

    pub fn burn_from(
        env: Env,
        spender: Address,
        from: Address,
        amount: i128,
    ) -> Result<(), Error> {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount)?;
        do_burn(&env, &from, amount)
    }

    pub fn decimals(_env: Env) -> u32 {
        DECIMALS
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, "Mock USD Coin")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "USDC")
    }
}

// --- helpers ---------------------------------------------------------------

fn read_balance(env: &Env, addr: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(addr.clone()))
        .unwrap_or(0)
}

fn write_balance(env: &Env, addr: &Address, amount: i128) {
    let key = DataKey::Balance(addr.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage().persistent().extend_ttl(&key, 17_280, 518_400);
}

fn read_allowance(env: &Env, from: &Address, spender: &Address) -> AllowanceValue {
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    match env.storage().temporary().get::<_, AllowanceValue>(&key) {
        Some(v) if v.expiration_ledger >= env.ledger().sequence() => v,
        _ => AllowanceValue {
            amount: 0,
            expiration_ledger: 0,
        },
    }
}

fn spend_allowance(
    env: &Env,
    from: &Address,
    spender: &Address,
    amount: i128,
) -> Result<(), Error> {
    if amount < 0 {
        return Err(Error::InvalidAmount);
    }
    let allowance = read_allowance(env, from, spender);
    if allowance.amount < amount {
        return Err(Error::InsufficientAllowance);
    }
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    env.storage().temporary().set(
        &key,
        &AllowanceValue {
            amount: allowance.amount - amount,
            expiration_ledger: allowance.expiration_ledger,
        },
    );
    Ok(())
}

fn do_transfer(env: &Env, from: &Address, to: &Address, amount: i128) -> Result<(), Error> {
    if amount < 0 {
        return Err(Error::InvalidAmount);
    }
    let from_balance = read_balance(env, from);
    if from_balance < amount {
        return Err(Error::InsufficientBalance);
    }
    write_balance(env, from, from_balance - amount);
    let to_balance = read_balance(env, to);
    write_balance(env, to, to_balance + amount);
    Ok(())
}

fn do_burn(env: &Env, from: &Address, amount: i128) -> Result<(), Error> {
    if amount < 0 {
        return Err(Error::InvalidAmount);
    }
    let from_balance = read_balance(env, from);
    if from_balance < amount {
        return Err(Error::InsufficientBalance);
    }
    write_balance(env, from, from_balance - amount);
    Ok(())
}
