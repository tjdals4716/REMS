package com.example.REMS.DTO;

import com.example.REMS.Entity.BuildingEntity;
import com.example.REMS.Entity.UserEntity;
import lombok.*;

import java.util.*;
import java.util.stream.Collectors;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class BuildingDTO {
    private Long id;
    private String name;
    private String address;
    private String type;
    private double lat;
    private double lng;
    private int floors;
    private String memo;
    private String ownerUid;    // 작성자 uid (응답 표시용, 읽기 전용)

    // 프론트 오브젝트처럼 호실 목록을 중첩해서 담는다
    @Builder.Default
    private List<UnitDTO> units = new ArrayList<>();

    public static BuildingDTO entityToDto(BuildingEntity buildingEntity) {
        List<UnitDTO> unitDTOs = buildingEntity.getUnits().stream()
                .map(UnitDTO::entityToDto)
                .collect(Collectors.toList());
        String ownerUid = (buildingEntity.getOwner() != null) ? buildingEntity.getOwner().getUid() : null;

        return new BuildingDTO(
                buildingEntity.getId(),
                buildingEntity.getName(),
                buildingEntity.getAddress(),
                buildingEntity.getType(),
                buildingEntity.getLat(),
                buildingEntity.getLng(),
                buildingEntity.getFloors(),
                buildingEntity.getMemo(),
                ownerUid,
                unitDTOs);
    }

    // 소유자(owner)를 지정하여 엔티티로 변환 (Post 패턴: dtoToEntity(userEntity))
    public BuildingEntity dtoToEntity(UserEntity owner) {
        BuildingEntity buildingEntity = BuildingEntity.builder()
                .id(id)
                .name(name)
                .address(address)
                .type(type)
                .lat(lat)
                .lng(lng)
                .floors(floors)
                .memo(memo)
                .owner(owner)
                .units(new ArrayList<>())
                .build();

        // 중첩된 호실들을 양방향 연관관계로 연결
        if (units != null) {
            for (UnitDTO unitDTO : units) {
                buildingEntity.addUnit(unitDTO.dtoToEntity());
            }
        }
        return buildingEntity;
    }

    public BuildingEntity dtoToEntity() {
        return dtoToEntity(null);
    }
}
