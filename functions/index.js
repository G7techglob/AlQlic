const { onCall, HttpsError } =
    require("firebase-functions/v2/https");

const { initializeApp } =
    require("firebase-admin/app");

const {
    getFirestore,
    FieldValue
} =
    require("firebase-admin/firestore");

const crypto =
    require("crypto");


// =====================================================
// INITIALIZE FIREBASE ADMIN
// =====================================================

initializeApp();

const db = getFirestore();


// =====================================================
// GENERATE SECURE MATCHCONNECT WALLET ID
// =====================================================

function generateWalletId() {

    return (
        "MC-" +
        crypto
            .randomBytes(8)
            .toString("hex")
            .toUpperCase()
    );

}


// =====================================================
// CREATE / GET USER WALLET
// =====================================================

exports.createWallet = onCall(
    async (request) => {

        // =================================================
        // REQUIRE LOGIN
        // =================================================

        if (!request.auth) {

            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );

        }


        const uid =
            request.auth.uid;


        const walletRef =
            db.collection("wallets")
              .doc(uid);


        // =================================================
        // CHECK WHETHER WALLET ALREADY EXISTS
        // =================================================

        const existingWallet =
            await walletRef.get();


        if (existingWallet.exists) {

            const data =
                existingWallet.data();

            return {

                success: true,

                existing: true,

                walletId:
                    data.walletId || "",

                balanceMCC:
                    Number(data.balanceMCC || 0),

                lockedMCC:
                    Number(data.lockedMCC || 0),

                earningsAvailableNGN:
                    Number(
                        data.earningsAvailableNGN || 0
                    ),

                earningsLockedNGN:
                    Number(
                        data.earningsLockedNGN || 0
                    )

            };

        }


        // =================================================
        // CREATE NEW WALLET
        // =================================================

        const walletId =
            generateWalletId();


        const walletData = {

            userId:
                uid,

            walletId:
                walletId,

            balanceMCC:
                0,

            lockedMCC:
                0,

            earningsAvailableNGN:
                0,

            earningsLockedNGN:
                0,

            defaultCurrency:
                "MCC",

            status:
                "active",

            createdAt:
                FieldValue.serverTimestamp(),

            updatedAt:
                FieldValue.serverTimestamp()

        };


        await walletRef.set(
            walletData
        );


        return {

            success:
                true,

            existing:
                false,

            walletId:
                walletId,

            balanceMCC:
                0,

            lockedMCC:
                0,

            earningsAvailableNGN:
                0,

            earningsLockedNGN:
                0

        };

    }
);


// =====================================================
// SECURE MCC USER-TO-USER TRANSFER
// =====================================================

exports.transferMCC = onCall(
    async (request) => {

        // =================================================
        // REQUIRE AUTHENTICATION
        // =================================================

        if (!request.auth) {

            throw new HttpsError(
                "unauthenticated",
                "You must be logged in to send MCC."
            );

        }


        const senderUid =
            request.auth.uid;


        // =================================================
        // READ REQUEST
        // =================================================

        const recipientWalletId =
            String(
                request.data?.recipientWalletId || ""
            ).trim();


        const amount =
            Number(
                request.data?.amount
            );


        // =================================================
        // VALIDATE RECIPIENT
        // =================================================

        if (!recipientWalletId) {

            throw new HttpsError(
                "invalid-argument",
                "Recipient Wallet ID is required."
            );

        }


        // =================================================
        // VALIDATE AMOUNT
        // =================================================

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {

            throw new HttpsError(
                "invalid-argument",
                "Enter a valid MCC amount."
            );

        }


        if (
            !Number.isInteger(amount)
        ) {

            throw new HttpsError(
                "invalid-argument",
                "MCC amount must be a whole number."
            );

        }


        // =================================================
        // SENDER WALLET
        // =================================================

        const senderWalletRef =
            db.collection("wallets")
              .doc(senderUid);


        // =================================================
        // FIND RECIPIENT
        // =================================================

        const recipientQuery =
            db.collection("wallets")
              .where(
                  "walletId",
                  "==",
                  recipientWalletId
              )
              .limit(1);


        // =================================================
        // UNIQUE TRANSFER REFERENCE
        // =================================================

        const transferReference =
            "TRF-" +
            Date.now() +
            "-" +
            crypto
                .randomBytes(4)
                .toString("hex")
                .toUpperCase();


        // =================================================
        // ATOMIC TRANSACTION
        // =================================================

        await db.runTransaction(
            async (transaction) => {

                // -----------------------------------------
                // READ SENDER
                // -----------------------------------------

                const senderSnap =
                    await transaction.get(
                        senderWalletRef
                    );


                if (
                    !senderSnap.exists
                ) {

                    throw new HttpsError(
                        "not-found",
                        "Your wallet was not found."
                    );

                }


                const senderData =
                    senderSnap.data();


                // -----------------------------------------
                // VERIFY OWNERSHIP
                // -----------------------------------------

                if (
                    senderData.userId !== senderUid
                ) {

                    throw new HttpsError(
                        "permission-denied",
                        "This wallet does not belong to you."
                    );

                }


                // -----------------------------------------
                // READ RECIPIENT
                // -----------------------------------------

                const recipientSnap =
                    await transaction.get(
                        recipientQuery
                    );


                if (
                    recipientSnap.empty
                ) {

                    throw new HttpsError(
                        "not-found",
                        "Recipient wallet was not found."
                    );

                }


                const recipientDoc =
                    recipientSnap.docs[0];


                const recipientWalletRef =
                    recipientDoc.ref;


                const recipientData =
                    recipientDoc.data();


                const recipientUid =
                    recipientData.userId;


                // -----------------------------------------
                // PREVENT SELF TRANSFER
                // -----------------------------------------

                if (
                    recipientUid === senderUid
                ) {

                    throw new HttpsError(
                        "failed-precondition",
                        "You cannot send MCC to yourself."
                    );

                }


                // -----------------------------------------
                // BALANCES
                // -----------------------------------------

                const senderBalance =
                    Number(
                        senderData.balanceMCC || 0
                    );


                const senderLocked =
                    Number(
                        senderData.lockedMCC || 0
                    );


                const availableBalance =
                    senderBalance -
                    senderLocked;


                // -----------------------------------------
                // CHECK AVAILABLE BALANCE
                // -----------------------------------------

                if (
                    amount >
                    availableBalance
                ) {

                    throw new HttpsError(
                        "failed-precondition",
                        "Insufficient available MCC balance."
                    );

                }


                const recipientBalance =
                    Number(
                        recipientData.balanceMCC || 0
                    );


                // -----------------------------------------
                // NEW BALANCES
                // -----------------------------------------

                const newSenderBalance =
                    senderBalance -
                    amount;


                const newRecipientBalance =
                    recipientBalance +
                    amount;


                // -----------------------------------------
                // UPDATE SENDER
                // -----------------------------------------

                transaction.update(
                    senderWalletRef,
                    {

                        balanceMCC:
                            newSenderBalance,

                        updatedAt:
                            FieldValue.serverTimestamp()

                    }
                );


                // -----------------------------------------
                // UPDATE RECIPIENT
                // -----------------------------------------

                transaction.update(
                    recipientWalletRef,
                    {

                        balanceMCC:
                            newRecipientBalance,

                        updatedAt:
                            FieldValue.serverTimestamp()

                    }
                );


                // -----------------------------------------
                // SENDER LEDGER ENTRY
                // -----------------------------------------

                const senderTransactionRef =
                    db.collection(
                        "walletTransactions"
                    ).doc();


                transaction.set(
                    senderTransactionRef,
                    {

                        userId:
                            senderUid,

                        walletId:
                            senderData.walletId || "",

                        type:
                            "debit",

                        amount:
                            amount,

                        currency:
                            "MCC",

                        description:
                            "MCC Transfer Sent",

                        method:
                            "wallet",

                        recipientUserId:
                            recipientUid,

                        recipientWalletId:
                            recipientWalletId,

                        status:
                            "completed",

                        reference:
                            transferReference,

                        createdAt:
                            FieldValue.serverTimestamp()

                    }
                );


                // -----------------------------------------
                // RECIPIENT LEDGER ENTRY
                // -----------------------------------------

                const recipientTransactionRef =
                    db.collection(
                        "walletTransactions"
                    ).doc();


                transaction.set(
                    recipientTransactionRef,
                    {

                        userId:
                            recipientUid,

                        walletId:
                            recipientWalletId,

                        type:
                            "credit",

                        amount:
                            amount,

                        currency:
                            "MCC",

                        description:
                            "MCC Transfer Received",

                        method:
                            "wallet",

                        senderUserId:
                            senderUid,

                        senderWalletId:
                            senderData.walletId || "",

                        status:
                            "completed",

                        reference:
                            transferReference,

                        createdAt:
                            FieldValue.serverTimestamp()

                    }
                );

            }
        );


        // =================================================
        // SUCCESS
        // =================================================

        return {

            success:
                true,

            amount:
                amount,

            currency:
                "MCC",

            recipientWalletId:
                recipientWalletId,

            reference:
                transferReference,

            message:
                "MCC transfer completed successfully."

        };

    }
);


// =====================================================
// CREATE SECURE NGN EARNINGS WITHDRAWAL REQUEST
// =====================================================

exports.createEarningsWithdrawal = onCall(
    async (request) => {

        // =================================================
        // REQUIRE AUTHENTICATION
        // =================================================

        if (!request.auth) {

            throw new HttpsError(
                "unauthenticated",
                "You must be logged in to withdraw your earnings."
            );

        }


        const uid =
            request.auth.uid;


        // =================================================
        // READ REQUEST DATA
        // =================================================

        const amountNGN =
            Number(
                request.data?.amountNGN
            );


        const accountNumber =
            String(
                request.data?.accountNumber || ""
            ).trim();


        const bankCode =
            String(
                request.data?.bankCode || ""
            ).trim();


        // =================================================
        // VALIDATE AMOUNT
        // =================================================

        if (
            !Number.isFinite(amountNGN) ||
            amountNGN <= 0
        ) {

            throw new HttpsError(
                "invalid-argument",
                "Enter a valid NGN withdrawal amount."
            );

        }


        // =================================================
        // NGN WITHDRAWAL MUST BE WHOLE NAIRA
        // =================================================

        if (
            !Number.isInteger(amountNGN)
        ) {

            throw new HttpsError(
                "invalid-argument",
                "Withdrawal amount must be a whole number of NGN."
            );

        }


        // =================================================
        // VALIDATE BANK ACCOUNT
        // =================================================

        if (
            !/^\d{10}$/.test(accountNumber)
        ) {

            throw new HttpsError(
                "invalid-argument",
                "Enter a valid 10-digit Nigerian bank account number."
            );

        }


        // =================================================
        // VALIDATE BANK CODE
        // =================================================

        if (!bankCode) {

            throw new HttpsError(
                "invalid-argument",
                "Bank code is required."
            );

        }


        // =================================================
        // WALLET
        // =================================================

        const walletRef =
            db.collection("wallets")
              .doc(uid);


        const withdrawalRef =
            db.collection(
                "withdrawals"
            )
            .doc();


        const transactionRef =
            db.collection(
                "walletTransactions"
            )
            .doc();


        // =================================================
        // WITHDRAWAL REFERENCE
        // =================================================

        const withdrawalReference =
            "WDR-" +
            Date.now() +
            "-" +
            crypto
                .randomBytes(4)
                .toString("hex")
                .toUpperCase();


        // =================================================
        // ATOMICALLY LOCK EARNINGS
        // =================================================

        await db.runTransaction(
            async (transaction) => {

                const walletSnap =
                    await transaction.get(
                        walletRef
                    );


                // -----------------------------------------
                // WALLET MUST EXIST
                // -----------------------------------------

                if (
                    !walletSnap.exists
                ) {

                    throw new HttpsError(
                        "not-found",
                        "Wallet not found."
                    );

                }


                const walletData =
                    walletSnap.data();


                // -----------------------------------------
                // VERIFY OWNERSHIP
                // -----------------------------------------

                if (
                    walletData.userId !== uid
                ) {

                    throw new HttpsError(
                        "permission-denied",
                        "This wallet does not belong to you."
                    );

                }


                // -----------------------------------------
                // AVAILABLE EARNINGS
                // -----------------------------------------

                const availableEarnings =
                    Number(
                        walletData.earningsAvailableNGN || 0
                    );


                const lockedEarnings =
                    Number(
                        walletData.earningsLockedNGN || 0
                    );


                // -----------------------------------------
                // CHECK BALANCE
                // -----------------------------------------

                if (
                    amountNGN >
                    availableEarnings
                ) {

                    throw new HttpsError(
                        "failed-precondition",
                        "Insufficient available earnings."
                    );

                }


                // -----------------------------------------
                // MOVE AVAILABLE → LOCKED
                // -----------------------------------------

                const newAvailable =
                    availableEarnings -
                    amountNGN;


                const newLocked =
                    lockedEarnings +
                    amountNGN;


                transaction.update(
                    walletRef,
                    {

                        earningsAvailableNGN:
                            newAvailable,

                        earningsLockedNGN:
                            newLocked,

                        updatedAt:
                            FieldValue.serverTimestamp()

                    }
                );


                // -----------------------------------------
                // CREATE WITHDRAWAL
                // -----------------------------------------

                transaction.set(
                    withdrawalRef,
                    {

                        userId:
                            uid,

                        walletId:
                            walletData.walletId || "",

                        amountNGN:
                            amountNGN,

                        currency:
                            "NGN",

                        accountNumber:
                            accountNumber,

                        bankCode:
                            bankCode,

                        status:
                            "pending",

                        provider:
                            "flutterwave",

                        reference:
                            withdrawalReference,

                        createdAt:
                            FieldValue.serverTimestamp(),

                        updatedAt:
                            FieldValue.serverTimestamp()

                    }
                );


                // -----------------------------------------
                // CREATE LEDGER ENTRY
                // -----------------------------------------

                transaction.set(
                    transactionRef,
                    {

                        userId:
                            uid,

                        walletId:
                            walletData.walletId || "",

                        type:
                            "withdrawal",

                        amount:
                            amountNGN,

                        currency:
                            "NGN",

                        description:
                            "Earnings Withdrawal Request",

                        method:
                            "bank",

                        withdrawalId:
                            withdrawalRef.id,

                        reference:
                            withdrawalReference,

                        status:
                            "pending",

                        createdAt:
                            FieldValue.serverTimestamp()

                    }
                );

            }
        );


        // =================================================
        // RETURN PENDING STATUS
        // =================================================

        return {

            success:
                true,

            status:
                "pending",

            amountNGN:
                amountNGN,

            currency:
                "NGN",

            reference:
                withdrawalReference,

            message:
                "Withdrawal request created successfully. Payment will be processed after provider verification."

        };

    }
);
