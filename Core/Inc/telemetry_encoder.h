/**
 * @file    telemetry_encoder.h
 * @brief   SLIP Encoder for Binary Telemetry Frames
 */

#ifndef TELEMETRY_ENCODER_H
#define TELEMETRY_ENCODER_H

#include "telemetry_protocol.h"

/**
 * @brief  Encode a TelemetryPacket_t struct into a SLIP-framed byte buffer.
 * @param  pkt     Pointer to populated packet struct
 * @param  out_buf Destination byte array
 * @param  max_len Maximum capacity of destination buffer
 * @return Total number of framed bytes written to out_buf (0 on overflow)
 */
uint16_t Telemetry_EncodePacket(TelemetryPacket_t *pkt, uint8_t *out_buf, uint16_t max_len);

#endif /* TELEMETRY_ENCODER_H */
