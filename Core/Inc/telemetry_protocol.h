/**
 * @file    telemetry_protocol.h
 * @brief   Packed Binary Telemetry Frame and SLIP Protocol Definitions
 */

#ifndef TELEMETRY_PROTOCOL_H
#define TELEMETRY_PROTOCOL_H

#include "common.h"

/* ── SLIP Protocol Constants ─────────────────────────────────────── */
#define SLIP_END             0xC0U  /* Frame End delimiter             */
#define SLIP_ESC             0xDBU  /* Escape character                */
#define SLIP_ESC_END         0xDCU  /* Escaped 0xC0 -> (0xDB, 0xDC)    */
#define SLIP_ESC_ESC         0xDDU  /* Escaped 0xDB -> (0xDB, 0xDD)    */

#define TELEMETRY_MAGIC      0xAA55U
#define TELEMETRY_VERSION    1U

/* ── Packed Binary Telemetry Structure ───────────────────────────── */
#pragma pack(push, 1)
typedef struct {
    uint16_t magic;           /* 0xAA55 sync header               (2B) */
    uint8_t  version;         /* Protocol version (1)             (1B) */
    uint8_t  type;            /* Frame type ('D'=Data)            (1B) */
    uint32_t timestamp;       /* System uptime ms                 (4B) */
    uint32_t seq_id;          /* Rolling sequence ID              (4B) */
    float    speed_kmh;       /* Vehicle speed                    (4B) */
    float    soc_pct;         /* Battery State of Charge          (4B) */
    int16_t  motor_torque;    /* Motor torque in Nm               (2B) */
    float    motor_temp_c;    /* Motor temperature                (4B) */
    uint16_t range_km;        /* Estimated range                  (2B) */
    uint8_t  accel_pedal;     /* Accelerator %                    (1B) */
    uint8_t  brake_pedal;     /* Brake %                          (1B) */
    uint16_t front_cm;        /* Ultrasonic front distance        (2B) */
    uint16_t left_cm;         /* Ultrasonic left distance         (2B) */
    uint16_t right_cm;        /* Ultrasonic right distance        (2B) */
    float    ttc_sec;         /* Time to collision seconds        (4B) */
    uint8_t  collision_warn;  /* 0=None, 1=Warn, 2=Crit           (1B) */
    uint8_t  blindspot_left;  /* 0=Clear, 1=Target Detected       (1B) */
    uint8_t  blindspot_right; /* 0=Clear, 1=Target Detected       (1B) */
    uint8_t  alarm_priority;  /* 0=None, 1=Adv, 2=Warn, 3=Crit    (1B) */
    uint8_t  fault_flags;     /* Bitmask: 0x01 OT, 0x02 SOC, 0x04 (1B) */
    uint8_t  drive_mode;      /* 0=ECO, 1=NORMAL, 2=SPORT         (1B) */
    uint16_t crc16;           /* CRC-16-CCITT checksum            (2B) */
} TelemetryPacket_t;
#pragma pack(pop)

#endif /* TELEMETRY_PROTOCOL_H */
