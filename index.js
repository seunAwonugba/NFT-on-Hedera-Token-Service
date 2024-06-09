const {
    Client,
    PrivateKey,
    AccountCreateTransaction,
    AccountBalanceQuery,
    Hbar,
    TransferTransaction,
    TokenCreateTransaction,
    TokenType,
    TokenSupplyType,
    TokenMintTransaction,
    TokenAssociateTransaction,
} = require("@hashgraph/sdk");
const { TOKEN_NAME, MAX_RETRIES } = require("./constants");
require("dotenv").config();

//Grab your Hedera testnet account ID and private key from your .env file
const { HEDERA_PRIVATE_KEY, HEDERA_ACCOUNT_ID } = process.env;

// If we weren't able to grab it, we should throw a new error
if (!HEDERA_PRIVATE_KEY || !HEDERA_ACCOUNT_ID) {
    throw new Error(HEDERA_CREDENTIALS_NOT_FOUND);
}

const client = Client.forTestnet().setOperator(
    HEDERA_ACCOUNT_ID,
    HEDERA_PRIVATE_KEY
);

//Set your account as the client's operator
client.setOperator(HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY);

async function createNFT() {
    const newAccountPrivateKey = PrivateKey.generateED25519();
    const newAccountPublicKey = newAccountPrivateKey.publicKey;

    const newAccount = await new AccountCreateTransaction()
        .setKey(newAccountPublicKey)
        .setInitialBalance(Hbar.fromTinybars(0)) // 0 hbar
        .execute(client);

    const getReceipt = await newAccount.getReceipt(client);
    const newAccountAccountId = getReceipt.accountId;

    const supplyKey = PrivateKey.generateED25519();
    const treasuryKey = PrivateKey.fromStringDer(HEDERA_PRIVATE_KEY);

    //Create NFT
    const createNft = await new TokenCreateTransaction()
        .setTokenName(TOKEN_NAME)
        .setTokenSymbol("SAN")
        .setTokenType(TokenType.NonFungibleUnique)
        .setInitialSupply(0)
        .setDecimals(0)
        .setTreasuryAccountId(HEDERA_ACCOUNT_ID)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(250)
        .setSupplyKey(supplyKey)
        .freezeWith(client);

    //Sign the transaction with the treasury key
    const nftCreateTxSign = await createNft.sign(treasuryKey);

    //Submit the transaction to a Hedera network
    const nftCreateSubmit = await nftCreateTxSign.execute(client);

    //Get the transaction receipt
    const nftCreateTransactionReceipt = await nftCreateSubmit.getReceipt(
        client
    );

    //Get the token ID
    const tokenId = nftCreateTransactionReceipt.tokenId;

    console.log(`Created NFT with token id => ${tokenId}`);

    // Max transaction fee as a constant
    const maxTransactionFee = new Hbar(20);

    //IPFS content identifiers for which we will create a NFT
    const CID = [
        Buffer.from(
            "ipfs://bafyreiao6ajgsfji6qsgbqwdtjdu5gmul7tv2v3pd6kjgcw5o65b2ogst4/metadata.json"
        ),
        Buffer.from(
            "ipfs://bafyreic463uarchq4mlufp7pvfkfut7zeqsqmn3b2x3jjxwcjqx6b5pk7q/metadata.json"
        ),
        Buffer.from(
            "ipfs://bafyreihhja55q6h2rijscl3gra7a3ntiroyglz45z5wlyxdzs6kjh2dinu/metadata.json"
        ),
        Buffer.from(
            "ipfs://bafyreidb23oehkttjbff3gdi4vz7mjijcxjyxadwg32pngod4huozcwphu/metadata.json"
        ),
        Buffer.from(
            "ipfs://bafyreie7ftl6erd5etz5gscfwfiwjmht3b52cevdrf7hjwxx5ddns7zneu/metadata.json"
        ),
    ];

    // MINT  NFTs
    const mintTx = new TokenMintTransaction()
        .setTokenId(tokenId)
        .setMetadata(CID)
        .setMaxTransactionFee(maxTransactionFee)
        .freezeWith(client);

    //Sign the transaction with the supply key
    const mintTxSign = await mintTx.sign(supplyKey);

    //Submit the transaction to a Hedera network
    const mintTxSubmit = await mintTxSign.execute(client);

    //Get the transaction receipt
    const mintReceipt = await mintTxSubmit.getReceipt(client);

    //get the serial number
    const mintSerialNo = mintReceipt.serials[0].low;

    console.log(
        `Created NFT with Token id: ${tokenId} and serial No : ${mintSerialNo}`
    );

    //Create the associate transaction and sign with associates key
    // it needed in other to transfer NFT from one account to the other associate the account
    const associateTransaction = await new TokenAssociateTransaction()
        .setAccountId(newAccountAccountId)
        .setTokenIds([tokenId])
        .freezeWith(client)
        .sign(newAccountPrivateKey);

    //Submit the transaction to a Hedera network
    const submitAssociateTransaction = await associateTransaction.execute(
        client
    );

    //Get the transaction receipt
    const associateTransactionReceipt =
        await submitAssociateTransaction.getReceipt(client);

    //Confirm the transaction was successful
    console.log(
        `Associate transaction status => ${associateTransactionReceipt.status}`
    );

    //transfer NFT

    // Check the balance before the transfer for the treasury account
    const treasuaryBalanceCheckTx = await new AccountBalanceQuery()
        .setAccountId(HEDERA_ACCOUNT_ID)
        .execute(client);

    console.log(
        `- Treasury balance: ${treasuaryBalanceCheckTx.tokens._map.get(
            tokenId.toString()
        )} NFTs of ID ${tokenId}`
    );

    // Check the balance before the transfer for new account
    const newAccountBalanceCheckTx = await new AccountBalanceQuery()
        .setAccountId(newAccountAccountId)
        .execute(client);
    console.log(
        `- New account balance: ${newAccountBalanceCheckTx.tokens._map.get(
            tokenId.toString()
        )} NFTs of ID ${tokenId}`
    );

    // transfer the NFT from treasury to new account
    const tokenTransferTx = await new TransferTransaction()
        .addNftTransfer(tokenId, 1, HEDERA_ACCOUNT_ID, newAccountAccountId)
        .freezeWith(client)
        .sign(treasuryKey);

    const tokenTransferSubmit = await tokenTransferTx.execute(client);
    const tokenTransferRx = await tokenTransferSubmit.getReceipt(client);

    console.log(
        `\n- NFT transfer from Treasury to New Account: ${tokenTransferRx.status} \n`
    );

    // Check the balance after the transfer for the treasury account
    const treasuaryBalanceCheckAfterTransferTx = await new AccountBalanceQuery()
        .setAccountId(HEDERA_ACCOUNT_ID)
        .execute(client);

    console.log(
        `- Treasury balance: ${treasuaryBalanceCheckAfterTransferTx.tokens._map.get(
            tokenId.toString()
        )} NFTs of ID ${tokenId}`
    );

    // Check the balance before the transfer for new account
    const newAccountBalanceCheckAfterTx = await new AccountBalanceQuery()
        .setAccountId(newAccountAccountId)
        .execute(client);
    console.log(
        `- New account balance: ${newAccountBalanceCheckAfterTx.tokens._map.get(
            tokenId.toString()
        )} NFTs of ID ${tokenId}`
    );
}

const createFungibleToken = async () => {};

const executeTransaction = async (transaction, key) => {
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            const txSign = await transaction.sign(key);
            const txSubmit = await txSign.execute(client);
            const txReceipt = await txSubmit.getReceipt(client);

            // If the transaction succeeded, return the receipt
            return txReceipt;
        } catch (error) {
            // If the error is BUSY, retry the transaction
            if (error.toString().includes("BUSY")) {
                retries++;
            } else {
                throw error;
            }
        }
    }
    throw new Error(`Transaction failed after ${MAX_RETRIES} attempts`);
};

createNFT();
