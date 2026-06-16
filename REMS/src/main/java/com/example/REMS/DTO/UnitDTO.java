package com.example.REMS.DTO;

import com.example.REMS.Entity.UnitEntity;
import lombok.*;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class UnitDTO {
    private Long id;
    private Long buildingId;    // 소속 건물 id (응답용)
    private int floor;
    private String name;
    private String type;
    private String status;
    private double area;
    private String tenant;
    private int deposit;
    private int rent;
    private int manage;
    private String contractStart;
    private String contractEnd;
    private String memo;

    public static UnitDTO entityToDto(UnitEntity unitEntity) {
        return new UnitDTO(
                unitEntity.getId(),
                unitEntity.getBuilding() != null ? unitEntity.getBuilding().getId() : null,
                unitEntity.getFloor(),
                unitEntity.getName(),
                unitEntity.getType(),
                unitEntity.getStatus(),
                unitEntity.getArea(),
                unitEntity.getTenant(),
                unitEntity.getDeposit(),
                unitEntity.getRent(),
                unitEntity.getManage(),
                unitEntity.getContractStart(),
                unitEntity.getContractEnd(),
                unitEntity.getMemo());
    }

    public UnitEntity dtoToEntity() {
        return UnitEntity.builder()
                .id(id)
                .floor(floor)
                .name(name)
                .type(type)
                .status(status)
                .area(area)
                .tenant(tenant)
                .deposit(deposit)
                .rent(rent)
                .manage(manage)
                .contractStart(contractStart)
                .contractEnd(contractEnd)
                .memo(memo)
                .build();
    }
}
