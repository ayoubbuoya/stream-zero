use std::hash::poseidon2_permutation;

fn main(
    // === PUBLIC INPUTS ===
    commitment: pub Field,        
    current_time: pub u64,        
    withdraw_amount: pub u64,     
    nullifier_hash: pub Field,    

    // === PRIVATE INPUTS ===
    secret: Field,                
    salary_rate: u64,             
    start_time: u64               
) {
    // 1. Identity Check
    // We pad the input array with a 0 to reach the required length of 4
    let state_commitment = poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let computed_commitment = state_commitment[0];
    assert(computed_commitment == commitment);

    // 2. Anti-Replay Mechanism (Nullifier)
    // Same here: pad with two zeros to reach the required length of 4
    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let computed_nullifier = state_nullifier[0];
    assert(computed_nullifier == nullifier_hash);

    // 3. Streaming Math Logic
    assert(current_time >= start_time);
    let elapsed_time = current_time - start_time;
    let total_vested = elapsed_time * salary_rate;
    
    // Prove sufficient vested funds
    assert(total_vested >= withdraw_amount);
}