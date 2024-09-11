use anchor_lang::prelude::*;

declare_id!("38y1vrywbkV9xNUBQ2rdi6E1PNxj2EhWgakpN3zLtneu");

#[program]
pub mod push_comm {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
