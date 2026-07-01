package com.example.REMS.Service;

import com.example.REMS.DTO.BuildingDTO;
import com.example.REMS.Entity.BuildingEntity;
import com.example.REMS.Entity.UserEntity;
import com.example.REMS.Repository.BuildingRepository;
import com.example.REMS.Repository.UserRepository;
import com.example.REMS.Exception.ImageLimitExceededException;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.scheduling.annotation.Scheduled;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BuildingService {

    private static final Logger logger = LoggerFactory.getLogger(BuildingService.class);
    private static final int MAX_IMAGES = 10;   // 건물당 첨부 가능한 최대 이미지 수
    private static final int TRASH_RETENTION_DAYS = 30;  // 휴지통 보관 기간(일). 경과 시 자동 영구 삭제
    private final BuildingRepository buildingRepository;
    private final UserRepository userRepository;
    private final com.example.REMS.Repository.UserPermissionRepository userPermissionRepository;

    private static final String ADMIN_UID = "3635939452";

    // 권한 체크 — 관리자는 통과, 그 외에는 저장된 권한 플래그로 판단.
    //  action: "CREATE" / "UPDATE" / "DELETE"  (조회 차단은 프론트에서 처리)
    private void requirePermission(String uid, String action) {
        if (ADMIN_UID.equals(uid)) return;
        com.example.REMS.Entity.UserPermissionEntity perm =
                userPermissionRepository.findByUser_Uid(uid).orElse(null);
        boolean allowed;
        if (perm == null) {
            allowed = false;   // 권한 레코드 없으면 쓰기 금지 (조회는 별도)
        } else if ("CREATE".equals(action)) {
            allowed = Boolean.TRUE.equals(perm.getCanCreate());
        } else if ("UPDATE".equals(action)) {
            allowed = Boolean.TRUE.equals(perm.getCanUpdate());
        } else if ("DELETE".equals(action)) {
            allowed = Boolean.TRUE.equals(perm.getCanDelete());
        } else {
            allowed = false;
        }
        if (!allowed) throw new RuntimeException("해당 작업 권한이 없습니다 (" + action + ")");
    }

    // GCS 업로드용 (PostService와 동일한 방식)
    private final Storage storage;
    @Value("${google.cloud.credentials.header}")
    private String googleCloudHeader;          // 공개 URL 접두사
    @Value("${google.cloud.storage.bucket}")
    private String bucket;                      // GCS 버킷명

    private void checkAuth(String uid, UserDetails userDetails) {
        if (userDetails == null || !userDetails.getUsername().equals(uid)) {
            throw new RuntimeException("권한이 없습니다");
        }
    }

    private UserEntity getAuthorizedUser(String uid, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        return userRepository.findByUid(uid)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다"));
    }

    private void checkOwner(BuildingEntity building, String uid) {
        if (building.getOwner() == null || !building.getOwner().getUid().equals(uid)) {
            throw new RuntimeException("해당 건물에 대한 권한이 없습니다");
        }
    }

    // 미디어 파일 1개를 GCS에 업로드하고 공개 URL 반환 (빈 파일이면 null)
    private String uploadMedia(MultipartFile mediaFile) {
        if (mediaFile == null || mediaFile.isEmpty()) return null;
        try {
            UUID uuid = UUID.randomUUID();
            String original = mediaFile.getOriginalFilename();
            String ext = (original != null && original.contains(".")) ? original.substring(original.lastIndexOf(".")) : "";
            String fileName = uuid.toString() + ext;

            String contentType;
            switch (ext.toLowerCase()) {
                case ".jpg":
                case ".jpeg": contentType = "image/jpeg"; break;
                case ".png":  contentType = "image/png";  break;
                case ".bmp":  contentType = "image/bmp";  break;
                case ".gif":  contentType = "image/gif";  break;
                case ".webp": contentType = "image/webp"; break;
                case ".mp4":  contentType = "video/mp4";  break;
                case ".avi":  contentType = "video/avi";  break;
                case ".wmv":  contentType = "video/wmv";  break;
                case ".mpeg": contentType = "video/mpeg"; break;
                default:      contentType = "application/octet-stream";
            }

            BlobId blobId = BlobId.of(bucket, fileName);
            BlobInfo blobInfo = BlobInfo.newBuilder(blobId)
                    .setContentType(contentType)
                    .setContentDisposition("inline; filename=" + original)
                    .build();
            storage.create(blobInfo, mediaFile.getBytes());
            return googleCloudHeader + fileName;
        } catch (IOException e) {
            throw new RuntimeException("미디어 파일 업로드 중 오류가 발생했습니다.", e);
        }
    }

    // 미디어 파일 여러 개 업로드 → URL 목록 (빈 파일/null은 건너뜀)
    private List<String> uploadMediaList(List<MultipartFile> mediaFiles) {
        List<String> urls = new ArrayList<>();
        if (mediaFiles == null) return urls;
        for (MultipartFile file : mediaFiles) {
            String url = uploadMedia(file);
            if (url != null) urls.add(url);
        }
        return urls;
    }

    // 비어있지 않은 파일 개수
    private int countFiles(List<MultipartFile> mediaFiles) {
        if (mediaFiles == null) return 0;
        int n = 0;
        for (MultipartFile f : mediaFiles) {
            if (f != null && !f.isEmpty()) n++;
        }
        return n;
    }

    // 건물 추가 (작성자 = 토큰의 사용자, 미디어 파일 여러 장 선택)
    @Transactional
    public BuildingDTO createBuilding(String uid, BuildingDTO buildingDTO, List<MultipartFile> mediaFiles, UserDetails userDetails) {
        UserEntity owner = getAuthorizedUser(uid, userDetails);
        requirePermission(uid, "CREATE");

        // 장수 제한 검사 (업로드 전에 차단)
        if (countFiles(mediaFiles) > MAX_IMAGES) {
            throw new ImageLimitExceededException("사진은 최대 " + MAX_IMAGES + "장까지만 첨부할 수 있습니다.");
        }

        BuildingEntity buildingEntity = buildingDTO.dtoToEntity(owner);

        // 새로 업로드한 이미지로 목록 구성
        List<String> uploaded = uploadMediaList(mediaFiles);
        buildingEntity.getMediaURLs().clear();
        buildingEntity.getMediaURLs().addAll(uploaded);

        BuildingEntity savedBuilding = buildingRepository.save(buildingEntity);
        logger.info("건물 등록 완료! 작성자: {}, id={}, 이미지 {}장", uid, savedBuilding.getId(), uploaded.size());
        return BuildingDTO.entityToDto(savedBuilding);
    }

    @Transactional(readOnly = true)
    public List<BuildingDTO> getAllBuildings(String uid, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        List<BuildingDTO> buildings = buildingRepository.findByDeletedAtIsNull().stream()
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
        logger.info("전체 건물 {}개 조회 완료! 요청자: {}", buildings.size(), uid);
        return buildings;
    }

    @Transactional(readOnly = true)
    public BuildingDTO findById(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        logger.info("{}번 건물 조회 완료! 요청자: {}", id, uid);
        return BuildingDTO.entityToDto(buildingEntity);
    }

    @Transactional(readOnly = true)
    public List<BuildingDTO> search(String uid, String keyword, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        return buildingRepository.searchAll(keyword).stream()
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BuildingDTO> findByType(String uid, String type, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        return buildingRepository.findByTypeAndDeletedAtIsNull(type).stream()
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
    }

    // 거래유형별 필터 (sale/jeonse/monthly) — 정상(휴지통 아님) 건물만
    @Transactional(readOnly = true)
    public List<BuildingDTO> findByDealType(String uid, String dealType, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        return buildingRepository.findByDealTypeAndDeletedAtIsNull(dealType).stream()
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
    }

    // 건물 수정 — 작성자 본인만
    //  - buildingDTO.mediaURLs : 유지할 기존 이미지 URL 목록 (UI에서 제거한 건 빠져있음)
    //  - mediaFiles            : 새로 추가 업로드할 파일들
    //  → 최종 이미지 = 유지목록 + 신규 업로드
    @Transactional
    public BuildingDTO updateBuilding(String uid, BuildingDTO buildingDTO, List<MultipartFile> mediaFiles, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(buildingDTO.getId())
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(buildingEntity, uid);
        requirePermission(uid, "UPDATE");

        buildingEntity.setName(buildingDTO.getName());
        buildingEntity.setAddress(buildingDTO.getAddress());
        buildingEntity.setDetailAddress(buildingDTO.getDetailAddress());
        buildingEntity.setType(buildingDTO.getType());
        buildingEntity.setLat(buildingDTO.getLat());
        buildingEntity.setLng(buildingDTO.getLng());
        buildingEntity.setDeposit(buildingDTO.getDeposit());
        buildingEntity.setRent(buildingDTO.getRent());
        buildingEntity.setManage(buildingDTO.getManage());
        buildingEntity.setDealType(buildingDTO.getDealType());
        buildingEntity.setJeonseLoanAvailable(buildingDTO.getJeonseLoanAvailable());
        buildingEntity.setJeonseLoanType(buildingDTO.getJeonseLoanType());
        buildingEntity.setParkingAvailable(buildingDTO.getParkingAvailable());
        buildingEntity.setPetAllowed(buildingDTO.getPetAllowed());
        buildingEntity.setMemo(buildingDTO.getMemo());

        // 유지할 기존 이미지 + 새로 업로드한 이미지 병합
        List<String> keep = (buildingDTO.getMediaURLs() != null) ? buildingDTO.getMediaURLs() : new ArrayList<>();

        // 장수 제한 검사 (유지목록 + 신규파일, 업로드 전에 차단)
        if (keep.size() + countFiles(mediaFiles) > MAX_IMAGES) {
            throw new ImageLimitExceededException("사진은 최대 " + MAX_IMAGES + "장까지만 첨부할 수 있습니다.");
        }

        List<String> added = uploadMediaList(mediaFiles);

        List<String> merged = new ArrayList<>();
        merged.addAll(keep);
        merged.addAll(added);

        // 영속 컬렉션을 직접 비우고 다시 채워야 @ElementCollection 이 안전하게 갱신됨
        buildingEntity.getMediaURLs().clear();
        buildingEntity.getMediaURLs().addAll(merged);

        logger.info("{}번 건물 수정 완료! 작성자: {}, 유지 {}장 + 신규 {}장 = 총 {}장",
                buildingEntity.getId(), uid, keep.size(), added.size(), merged.size());
        return BuildingDTO.entityToDto(buildingEntity);
    }

    // 건물 삭제 — 작성자 본인만. 즉시 지우지 않고 "휴지통으로 이동"(소프트 삭제: deletedAt 기록)
    @Transactional
    public BuildingDTO deleteBuilding(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(buildingEntity, uid);
        requirePermission(uid, "DELETE");
        buildingEntity.setDeletedAt(LocalDateTime.now());   // 휴지통으로 이동
        buildingRepository.save(buildingEntity);
        logger.info("{}번 건물 휴지통 이동! 작성자: {}", id, uid);
        return BuildingDTO.entityToDto(buildingEntity);
    }

    // 휴지통 목록 — 작성자 본인의, 삭제됐고 아직 30일 안 지난 건물만
    @Transactional(readOnly = true)
    public List<BuildingDTO> getTrash(String uid, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        LocalDateTime threshold = LocalDateTime.now().minusDays(TRASH_RETENTION_DAYS);
        return buildingRepository.findByOwner_UidAndDeletedAtIsNotNullOrderByDeletedAtDesc(uid).stream()
                .filter(b -> b.getDeletedAt() != null && b.getDeletedAt().isAfter(threshold))
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
    }

    // 휴지통에서 복원 — 작성자 본인만 (deletedAt 해제)
    @Transactional
    public BuildingDTO restoreBuilding(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(buildingEntity, uid);
        buildingEntity.setDeletedAt(null);
        buildingRepository.save(buildingEntity);
        logger.info("{}번 건물 복원! 작성자: {}", id, uid);
        return BuildingDTO.entityToDto(buildingEntity);
    }

    // 휴지통에서 완전(영구) 삭제 — 작성자 본인만 (cascade로 호실까지 삭제)
    @Transactional
    public BuildingDTO permanentlyDelete(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(buildingEntity, uid);
        requirePermission(uid, "DELETE");
        BuildingDTO deleted = BuildingDTO.entityToDto(buildingEntity);
        buildingRepository.delete(buildingEntity);
        logger.info("{}번 건물 영구 삭제! 작성자: {}", id, uid);
        return deleted;
    }

    // 매일 새벽 3시: 휴지통에서 30일 지난 건물 자동 영구 삭제
    // (활성화하려면 @EnableScheduling 필요 — SchedulingConfig.java 참고)
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void purgeExpiredTrash() {
        LocalDateTime threshold = LocalDateTime.now().minusDays(TRASH_RETENTION_DAYS);
        List<BuildingEntity> expired = buildingRepository.findByDeletedAtBefore(threshold);
        if (!expired.isEmpty()) {
            buildingRepository.deleteAll(expired);
            logger.info("휴지통 자동 정리: {}개 건물 영구 삭제 (삭제 후 {}일 경과)", expired.size(), TRASH_RETENTION_DAYS);
        }
    }
}