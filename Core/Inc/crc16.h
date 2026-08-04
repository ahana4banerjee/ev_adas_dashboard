/**
 * @file    crc16.h
 * @brief   CRC-16-CCITT calculation function for EV ADAS Telemetry
 */

#ifndef CRC16_H
#define CRC16_H

#include <stdint.h>

/**
 * @brief Calculates the CRC-16-CCITT checksum for a given byte buffer.
 * @param data: Pointer to the byte array to check.
 * @param length: Number of bytes in the array.
 * @retval Calculated 16-bit CRC checksum.
 */
uint16_t CRC16_Calculate(const uint8_t *data, uint16_t length);

#endif /* CRC16_H */
