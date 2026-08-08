/**
 * @file    dal_adc.c
 * @brief   Driver Abstraction Layer (DAL) for ADC conversions implementation
 */

#include "dal_adc.h"

static ADC_HandleTypeDef *_hadc = NULL;

void DAL_ADC_Init(ADC_HandleTypeDef *hadc)
{
    _hadc = hadc;
}

uint16_t DAL_ADC_ReadRaw(DAL_ADC_Channel_t ch)
{
    if (!_hadc) return 0;

    uint32_t hal_channel;
    switch (ch) {
        case DAL_ADC_ACCEL: hal_channel = ADC_CHANNEL_0; break;
        case DAL_ADC_BRAKE: hal_channel = ADC_CHANNEL_1; break;
        case DAL_ADC_TEMP:  hal_channel = ADC_CHANNEL_3; break;
        default: return 0;
    }

    ADC_ChannelConfTypeDef sConfig = {0};
    sConfig.Channel      = hal_channel;
    sConfig.Rank         = ADC_REGULAR_RANK_1;
    sConfig.SamplingTime = ADC_SAMPLETIME_71CYCLES_5;

    HAL_ADC_ConfigChannel(_hadc, &sConfig);
    HAL_ADC_Start(_hadc);
    HAL_ADC_PollForConversion(_hadc, 10);
    return (uint16_t)HAL_ADC_GetValue(_hadc);
}

float DAL_ADC_ReadPercent(DAL_ADC_Channel_t ch)
{
    uint16_t raw = DAL_ADC_ReadRaw(ch);
    return CLAMP(((float)raw / 4095.0f) * 100.0f, 0.0f, 100.0f);
}

float DAL_ADC_ReadTemperature(void)
{
    uint16_t raw = DAL_ADC_ReadRaw(DAL_ADC_TEMP);
    return CLAMP(((float)raw / 4095.0f) * 120.0f, 0.0f, 120.0f);
}
