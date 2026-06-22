#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, MockStablecoinClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(MockStablecoin, (admin.clone(),));
    let client = MockStablecoinClient::new(&env, &id);
    (env, client, admin)
}

#[test]
fn test_metadata() {
    let (env, client, _) = setup();
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.symbol(), String::from_str(&env, "USDC"));
}

#[test]
fn test_mint_and_transfer() {
    let (env, client, _) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.mint(&alice, &1_000);
    assert_eq!(client.balance(&alice), 1_000);

    client.transfer(&alice, &bob, &400);
    assert_eq!(client.balance(&alice), 600);
    assert_eq!(client.balance(&bob), 400);
}

#[test]
fn test_transfer_insufficient_balance() {
    let (env, client, _) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    client.mint(&alice, &100);
    let err = client.try_transfer(&alice, &bob, &200).err().unwrap().unwrap();
    assert_eq!(err, Error::InsufficientBalance);
}

#[test]
fn test_approve_and_transfer_from() {
    let (env, client, _) = setup();
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let dest = Address::generate(&env);

    client.mint(&owner, &1_000);
    client.approve(&owner, &spender, &500, &10_000);
    assert_eq!(client.allowance(&owner, &spender), 500);

    client.transfer_from(&spender, &owner, &dest, &300);
    assert_eq!(client.balance(&dest), 300);
    assert_eq!(client.balance(&owner), 700);
    assert_eq!(client.allowance(&owner, &spender), 200);
}
