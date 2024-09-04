/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/payment.json`.
 */
export type Payment = {
  "address": "7jrJjXs5mrvye9rofZW3MMnB2aeTFbb1vAccg5e1sCGC",
  "metadata": {
    "name": "payment",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "paymentState",
          "writable": true
        },
        {
          "name": "userTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  45,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "account"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "programToken",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "record",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "sn"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "account",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "frozen",
          "type": "u64"
        },
        {
          "name": "sn",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "expiredAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "paymentState",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "paymentState",
      "discriminator": [
        108,
        22,
        191,
        124,
        9,
        73,
        22,
        238
      ]
    },
    {
      "name": "transactionRecord",
      "discriminator": [
        206,
        23,
        5,
        97,
        161,
        157,
        25,
        107
      ]
    },
    {
      "name": "userTokenAccount",
      "discriminator": [
        54,
        43,
        28,
        109,
        148,
        154,
        11,
        34
      ]
    }
  ],
  "events": [
    {
      "name": "depositEvent",
      "discriminator": [
        120,
        248,
        61,
        83,
        31,
        142,
        107,
        144
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "disabled",
      "msg": "The program is disabled"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6002,
      "name": "expired",
      "msg": "Transaction expired"
    },
    {
      "code": 6003,
      "name": "invalidSignature",
      "msg": "Invalid signature"
    },
    {
      "code": 6004,
      "name": "alreadyExecuted",
      "msg": "Transaction already executed"
    },
    {
      "code": 6005,
      "name": "invalidMint",
      "msg": "Invalid mint"
    }
  ],
  "types": [
    {
      "name": "depositEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sn",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "account",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "token",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "frozen",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "paymentState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "nosnEnabled",
            "type": "bool"
          },
          {
            "name": "signer",
            "type": "pubkey"
          },
          {
            "name": "feeTo",
            "type": "pubkey"
          },
          {
            "name": "feeToAccount",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "transactionRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "executed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "userTokenAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "available",
            "type": "u64"
          },
          {
            "name": "frozen",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
