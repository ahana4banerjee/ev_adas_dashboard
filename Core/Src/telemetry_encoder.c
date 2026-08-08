/**
 * @file    telemetry_encoder.c
 * @brief   SLIP Encoder for Binary Telemetry Frames implementation
 */

#include "telemetry_encoder.h"
#include "crc16.h"
#include <string.h>

uint16_t Telemetry_EncodePacket(TelemetryPacket_t *pkt, uint8_t *out_buf, uint16_t max_len)
{
    if (!pkt || !out_buf || max_len < (sizeof(TelemetryPacket_t) * 2 + 2)) {
        return 0;
    }

    pkt->magic   = TELEMETRY_MAGIC;
    pkt->version = TELEMETRY_VERSION;
    pkt->type    = 'D';

    /* Calculate CRC-16 over all struct bytes up to (but excluding) the crc16 field */
    uint16_t payload_len = sizeof(TelemetryPacket_t) - sizeof(uint16_t);
    pkt->crc16 = CRC16_Calculate((const uint8_t*)pkt, payload_len);

    const uint8_t *raw_bytes = (const uint8_t*)pkt;
    uint16_t total_size      = sizeof(TelemetryPacket_t);
    uint16_t out_idx         = 0;

    /* Start Frame Delimiter */
    out_buf[out_idx++] = SLIP_END;

    /* Encode and escape payload */
    for (uint16_t i = 0; i < total_size; i++) {
        uint8_t byte = raw_bytes[i];
        if (byte == SLIP_END) {
            if (out_idx + 2 >= max_len) return 0;
            out_buf[out_idx++] = SLIP_ESC;
            out_buf[out_idx++] = SLIP_ESC_END;
        } else if (byte == SLIP_ESC) {
            if (out_idx + 2 >= max_len) return 0;
            out_buf[out_idx++] = SLIP_ESC;
            out_buf[out_idx++] = SLIP_ESC_ESC;
        } else {
            if (out_idx + 1 >= max_len) return 0;
            out_buf[out_idx++] = byte;
        }
    }

    /* End Frame Delimiter */
    if (out_idx + 1 > max_len) return 0;
    out_buf[out_idx++] = SLIP_END;

    return out_idx;
}
